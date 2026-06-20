import { NextResponse } from "next/server";
import { readAndVerifyWebhookBodyAsync, type WebhookEnvelope } from "@/lib/webhook-verify";
import { ensureSystemUser } from "@/lib/system-user";
import { db } from "@/lib/db-libsql";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhook/result
 *
 * Receiver for the scraper's "results_push" webhook.
 *
 * After the scraper runs scrape_results() for a date, it POSTs the final
 * scores here so the website can update the Prediction table with
 * home_score, away_score, result_status = FINAL, result_source = "scraper".
 *
 * The payload is HMAC-SHA256 signed with WEBHOOK_SECRET (same secret as
 * the engine → website webhooks), so the website can verify authenticity
 * without needing a session cookie.
 *
 * Payload envelope:
 *   {
 *     "event": "results_push",
 *     "timestamp": "2026-06-19T13:00:00Z",
 *     "data": {
 *       "date": "19.06.2026",
 *       "source": "flashscore-scraper",
 *       "results": [
 *         { "match_id": "abc123", "home_score": 88, "away_score": 82, "status": "finished" },
 *         ...
 *       ]
 *     }
 *   }
 *
 * For each result:
 *   - Look up the Prediction by matchId
 *   - If found AND not already FINAL (don't overwrite manual entries with scraper data
 *     unless they're still PENDING/LIVE), update it
 *   - Skip matches not in the DB (they may have been filtered out earlier)
 *
 * Returns: { status, stored, skipped, errors, total_in_db }
 */

interface ResultEntry {
  match_id: string;
  home_score: number | null;
  away_score: number | null;
  status?: string; // "finished" | "in_progress" | "scheduled" | etc.
}

interface ResultsPushData {
  date?: string;
  source?: string;
  results?: ResultEntry[];
}

export async function POST(request: Request) {
  // 1. Verify HMAC signature
  const envelope = await readAndVerifyWebhookBodyAsync<WebhookEnvelope<ResultsPushData>>(request);
  if (!envelope) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (envelope.event !== "results_push") {
    return NextResponse.json({ error: `Unexpected event '${envelope.event}'` }, { status: 400 });
  }

  const data = envelope.data || {};
  console.log("[webhook/result] Received:", {
    date: data.date,
    results_count: data.results?.length || 0,
    source: data.source,
  });

  let stored = 0;
  let skipped = 0;
  let errors = 0;
  const nowIso = new Date().toISOString();

  // 2. Upsert results into Turso DB
  if (data.results && Array.isArray(data.results)) {
    for (const r of data.results) {
      try {
        if (!r.match_id) {
          console.warn("[webhook/result] Skipping entry with no match_id:", r);
          skipped++;
          continue;
        }

        // Only process "finished" matches — skip in-progress/scheduled/etc.
        // Case-insensitive: Flashscore returns "FINISHED" (uppercase)
        if (r.status && r.status.toLowerCase() !== "finished") {
          skipped++;
          continue;
        }

        if (r.home_score == null || r.away_score == null) {
          skipped++;
          continue;
        }

        const existing = await db.prediction.findUnique({
          where: { matchId: r.match_id },
        });

        if (!existing) {
          // Match not in our DB — may have been filtered out (NO_BET, insufficient H2H, etc.)
          skipped++;
          continue;
        }

        // Don't overwrite manually-entered FINAL results with scraper data.
        // Only update if status is null/PENDING/LIVE, OR if the existing result
        // was set by the scraper (resultSource = "scraper").
        if (
          existing.resultStatus === "FINAL" &&
          existing.resultSource === "manual"
        ) {
          skipped++;
          continue;
        }

        await db.prediction.update({
          where: { matchId: r.match_id },
          data: {
            homeScore: r.home_score,
            awayScore: r.away_score,
            resultStatus: "FINAL",
            resultSource: "scraper",
            resultUpdatedAt: nowIso,
          },
        });
        stored++;
      } catch (err) {
        console.error(`[webhook/result] Failed to update ${r.match_id}:`, err);
        errors++;
      }
    }
  }

  // 3. Log to activity log
  try {
    const systemUserId = await ensureSystemUser();
    if (systemUserId) {
      await db.activityLog.create({
        data: {
          userId: systemUserId,
          action: "SCRAPER_RESULTS_PUSH",
          service: "scraper",
          details: JSON.stringify({
            date: data.date ?? null,
            source: data.source ?? "flashscore-scraper",
            stored,
            skipped,
            errors,
            total_received: data.results?.length || 0,
            received_at: envelope.timestamp,
          }),
        },
      });
    }
  } catch (e) {
    console.warn("[webhook/result] Activity log failed:", e);
  }

  return NextResponse.json({
    status: "ok",
    stored,
    skipped,
    errors,
    total_in_db: stored,
  });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
