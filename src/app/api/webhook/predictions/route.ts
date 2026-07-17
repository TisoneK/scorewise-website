import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { readAndVerifyWebhookBodyAsync, type WebhookEnvelope } from "@/lib/webhook-verify";
import { logWebhookRejected } from "@/lib/webhook-reject-log";
import { ensureSystemUser } from "@/lib/system-user";
import { db } from "@/lib/db-libsql";
import { upsertEnginePredictions, type EnginePrediction } from "@/lib/prediction-upsert";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhook/predictions
 *
 * Receiver for the engine's "predictions_updated" webhook.
 *
 * Now stores full prediction data in the Turso DB so predictions survive
 * engine redeploys. The website becomes the source of truth for predictions.
 */

interface PredictionsUpdatedData {
  total_predictions?: number;
  succeeded?: number;
  failed?: number;
  source?: string;
  scraped_at?: string;
  ingestion_count?: number;
  predictions?: EnginePrediction[];
}

export async function POST(request: Request) {
  // 1. Verify HMAC signature
  const envelope = await readAndVerifyWebhookBodyAsync<WebhookEnvelope<PredictionsUpdatedData>>(request);
  if (!envelope) {
    await logWebhookRejected("webhook/predictions", "engine");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (envelope.event !== "predictions_updated") {
    return NextResponse.json({ error: `Unexpected event '${envelope.event}'` }, { status: 400 });
  }

  const data = envelope.data || {};
  console.log("[webhook/predictions] Received:", {
    total: data.total_predictions,
    predictions_count: data.predictions?.length || 0,
    source: data.source,
  });

  let stored = 0;
  let updated = 0;
  let errors = 0;

  // 2. Upsert predictions into Turso DB (shared logic with /api/admin/engine/sync)
  if (data.predictions && Array.isArray(data.predictions)) {
    const counts = await upsertEnginePredictions(
      data.predictions,
      data.source || "flashscore-scraper",
      "webhook/predictions",
    );
    stored = counts.stored;
    updated = counts.updated;
    errors = counts.errors;
  }

  // 3. Invalidate caches
  try {
    revalidatePath("/api/predictions");
    revalidatePath("/");
  } catch (e) {
    console.warn("[webhook/predictions] revalidatePath failed:", e);
  }

  // 4. Log to activity log
  try {
    const systemUserId = await ensureSystemUser();
    if (systemUserId) {
      await db.activityLog.create({
        data: {
          userId: systemUserId,
          action: "ENGINE_PREDICTIONS_UPDATED",
          service: "engine",
          details: JSON.stringify({
            total: data.total_predictions ?? 0,
            succeeded: data.succeeded ?? 0,
            failed: data.failed ?? 0,
            stored_new: stored,
            updated_existing: updated,
            errors,
            source: data.source ?? null,
            scraped_at: data.scraped_at ?? null,
          }),
        },
      });
    }
  } catch (e) {
    console.error("[webhook/predictions] Activity log failed:", e);
  }

  return NextResponse.json({
    status: "ok",
    stored_new: stored,
    updated_existing: updated,
    errors,
    total_in_db: stored + updated,
  });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
