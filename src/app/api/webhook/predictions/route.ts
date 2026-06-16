import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { readAndVerifyWebhookBody, type WebhookEnvelope } from "@/lib/webhook-verify";
import { ensureSystemUser } from "@/lib/system-user";
import { db } from "@/lib/db-libsql";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhook/predictions
 *
 * Receiver for the engine's "predictions_updated" webhook (Phase 4).
 *
 * When the engine finishes ingesting new predictions (either via the scraper
 * webhook at /api/ingest, or via the engine-initiated fetch at
 * /api/fetch-from-scraper), it POSTs to this endpoint with a HMAC-signed
 * envelope:
 *
 *   {
 *     "event": "predictions_updated",
 *     "timestamp": "2026-06-16T13:00:00Z",
 *     "data": {
 *       "total_predictions": 12,
 *       "succeeded": 10,
 *       "failed": 2,
 *       "source": "flashscore-scraper",
 *       "scraped_at": "2026-06-16T12:58:00Z",
 *       "ingestion_count": 5
 *     }
 *   }
 *
 * This endpoint:
 *   1. Verifies the HMAC signature (rejects unsigned/mismatched requests with 401)
 *   2. Invalidates the cached /api/predictions response so the next page load
 *      shows fresh data (no 60s revalidate lag)
 *   3. Logs the event to the activity log under a sentinel "system" user
 *
 * Returns 200 on success, 401 on signature failure, 500 on internal error.
 */

interface PredictionsUpdatedData {
  total_predictions?: number;
  succeeded?: number;
  failed?: number;
  source?: string;
  scraped_at?: string;
  ingestion_count?: number;
}

export async function POST(request: Request) {
  // 1. Verify HMAC signature
  const envelope = await readAndVerifyWebhookBody<WebhookEnvelope<PredictionsUpdatedData>>(request);
  if (!envelope) {
    return NextResponse.json(
      { error: "Invalid signature or webhook secret not configured" },
      { status: 401 },
    );
  }

  // Defensive: confirm event type matches the route
  if (envelope.event !== "predictions_updated") {
    return NextResponse.json(
      { error: `Unexpected event type '${envelope.event}' at /api/webhook/predictions` },
      { status: 400 },
    );
  }

  const data = envelope.data || {};
  console.log("[webhook/predictions] Received:", {
    event: envelope.event,
    timestamp: envelope.timestamp,
    total_predictions: data.total_predictions,
    source: data.source,
  });

  // 2. Invalidate cached predictions so the next request fetches fresh data
  try {
    revalidatePath("/api/predictions");
    // Also revalidate the home page so the dashboard reflects new data
    revalidatePath("/");
  } catch (error) {
    // revalidatePath can throw during build, etc. — log and continue.
    console.warn("[webhook/predictions] revalidatePath failed:", error);
  }

  // 3. Log to activity log under the system user
  try {
    const systemUserId = await ensureSystemUser();
    if (systemUserId) {
      await db.activityLog.create({
        data: {
          userId: systemUserId,
          action: "ENGINE_PREDICTIONS_UPDATED",
          service: "engine",
          details: JSON.stringify({
            event: envelope.event,
            total_predictions: data.total_predictions ?? 0,
            succeeded: data.succeeded ?? 0,
            failed: data.failed ?? 0,
            source: data.source ?? null,
            scraped_at: data.scraped_at ?? null,
            ingestion_count: data.ingestion_count ?? null,
            received_at: envelope.timestamp,
          }),
        },
      });
    }
  } catch (error) {
    // Logging failure shouldn't fail the webhook — engine would retry.
    console.error("[webhook/predictions] Failed to log to activity log:", error);
  }

  return NextResponse.json({
    status: "ok",
    event: envelope.event,
    received_at: new Date().toISOString(),
    invalidated_paths: ["/api/predictions", "/"],
  });
}

// Reject other methods explicitly
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed — use POST" },
    { status: 405 },
  );
}
