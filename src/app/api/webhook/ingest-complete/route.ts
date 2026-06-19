import { NextResponse } from "next/server";
import { readAndVerifyWebhookBodyAsync, type WebhookEnvelope } from "@/lib/webhook-verify";
import { ensureSystemUser } from "@/lib/system-user";
import { db } from "@/lib/db-libsql";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhook/ingest-complete
 *
 * Receiver for the engine's "ingest_complete" webhook (Phase 4).
 *
 * After each ingestion run (scraper webhook or engine-initiated fetch), the
 * engine POSTs a summary here so the website can:
 *   - Track engine activity in the admin dashboard activity log
 *   - See how many matches succeeded/failed per run
 *   - Distinguish between 'scraper_webhook' and 'engine_fetch' triggers
 *
 * Payload envelope:
 *   {
 *     "event": "ingest_complete",
 *     "timestamp": "2026-06-16T13:00:00Z",
 *     "data": {
 *       "total": 3,
 *       "succeeded": 2,
 *       "failed": 1,
 *       "added": 2,
 *       "updated": 1,
 *       "store_total": 12,
 *       "source": "flashscore-scraper",
 *       "scraped_at": "2026-06-16T12:58:00Z",
 *       "ingestion_count": 5,
 *       "triggered_by": "scraper_webhook"
 *     }
 *   }
 *
 * This endpoint does NOT invalidate the predictions cache — that's handled
 * by the sibling /api/webhook/predictions endpoint. Separating the events
 * lets us log ingest metadata even if cache invalidation isn't desired.
 */

interface IngestCompleteData {
  total?: number;
  succeeded?: number;
  failed?: number;
  added?: number;
  updated?: number;
  store_total?: number;
  source?: string;
  scraped_at?: string;
  ingestion_count?: number;
  triggered_by?: string;
}

export async function POST(request: Request) {
  // 1. Verify HMAC signature
  const envelope = await readAndVerifyWebhookBodyAsync<WebhookEnvelope<IngestCompleteData>>(request);
  if (!envelope) {
    return NextResponse.json(
      { error: "Invalid signature or webhook secret not configured" },
      { status: 401 },
    );
  }

  if (envelope.event !== "ingest_complete") {
    return NextResponse.json(
      { error: `Unexpected event type '${envelope.event}' at /api/webhook/ingest-complete` },
      { status: 400 },
    );
  }

  const data = envelope.data || {};
  console.log("[webhook/ingest-complete] Received:", {
    event: envelope.event,
    timestamp: envelope.timestamp,
    total: data.total,
    succeeded: data.succeeded,
    triggered_by: data.triggered_by,
  });

  // 2. Log to activity log under the system user
  try {
    const systemUserId = await ensureSystemUser();
    if (systemUserId) {
      await db.activityLog.create({
        data: {
          userId: systemUserId,
          action: "ENGINE_INGEST_COMPLETE",
          service: "engine",
          details: JSON.stringify({
            event: envelope.event,
            total: data.total ?? 0,
            succeeded: data.succeeded ?? 0,
            failed: data.failed ?? 0,
            added: data.added ?? 0,
            updated: data.updated ?? 0,
            store_total: data.store_total ?? 0,
            source: data.source ?? null,
            scraped_at: data.scraped_at ?? null,
            ingestion_count: data.ingestion_count ?? null,
            triggered_by: data.triggered_by ?? "unknown",
            received_at: envelope.timestamp,
          }),
        },
      });
    }
  } catch (error) {
    console.error("[webhook/ingest-complete] Failed to log to activity log:", error);
  }

  return NextResponse.json({
    status: "ok",
    event: envelope.event,
    received_at: new Date().toISOString(),
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed — use POST" },
    { status: 405 },
  );
}
