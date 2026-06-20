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
  // Maps Flashscore match statuses to our resultStatus:
  //   FINISHED / AFTER OT / FT → FINAL (with scores)
  //   IN_PROGRESS / Q1-Q4 / HT / BREAK → LIVE (with partial scores)
  //   POSTPONED → POSTPONED (clears scores)
  //   CANCELLED → CANCELLED (clears scores)
  //   Unknown status + scores present → LIVE (match must be in progress)
  //   Unknown status + no scores → skip (match probably hasn't started)
  function mapFlashscoreStatus(
    rawStatus: string | undefined,
    homeScore: number | null,
    awayScore: number | null,
  ): {
    resultStatus: "FINAL" | "LIVE" | "POSTPONED" | "CANCELLED" | null;
  } {
    if (!rawStatus) {
      // No status text — if scores exist, match is in progress; otherwise skip
      if (homeScore != null && awayScore != null) return { resultStatus: "LIVE" };
      return { resultStatus: null };
    }
    const s = rawStatus.toUpperCase().trim();

    // Finished (including overtime variants)
    if (s === "FINISHED" || s.includes("AFTER") || s === "FT" || s === "FULL TIME") {
      return { resultStatus: "FINAL" };
    }
    // Live / in-progress (quarter info, halftime, breaks)
    if (
      s === "IN_PROGRESS" || s === "LIVE" ||
      s.includes("Q1") || s.includes("Q2") || s.includes("Q3") || s.includes("Q4") ||
      s.includes("HT") || s.includes("HALF") || s.includes("BREAK") ||
      s.includes("QUARTER") || s.includes("PERIOD") ||
      // Flashscore shows elapsed time for live matches, e.g. "3rd quarter", "2:34 Q3"
      s.match(/\d+:\d+/) || s.match(/\d+(ST|ND|RD|TH)\s*(QUARTER|PERIOD|Q)/i)
    ) {
      return { resultStatus: "LIVE" };
    }
    // Postponed / cancelled
    if (s.includes("POSTPONED")) return { resultStatus: "POSTPONED" };
    if (s.includes("CANCEL") || s.includes("ABANDONED") || s.includes("INTERRUPTED")) {
      return { resultStatus: "CANCELLED" };
    }
    // Unknown status — if scores are present, the match must be in progress.
    // Flashscore sometimes returns date/time text or other unexpected strings
    // as the status when a match is live. If we have scores, it's LIVE.
    if (homeScore != null && awayScore != null) {
      return { resultStatus: "LIVE" };
    }
    // No scores + unknown status → match probably hasn't started yet
    return { resultStatus: null };
  }

  if (data.results && Array.isArray(data.results)) {
    for (const r of data.results) {
      try {
        if (!r.match_id) {
          skipped++;
          continue;
        }

        // Map the Flashscore status to our resultStatus (passing scores for fallback logic)
        const { resultStatus } = mapFlashscoreStatus(r.status, r.home_score ?? null, r.away_score ?? null);
        if (!resultStatus) {
          // Status is SCHEDULED / UNKNOWN / null — skip (don't overwrite)
          skipped++;
          continue;
        }

        const existing = await db.prediction.findUnique({
          where: { matchId: r.match_id },
        });

        if (!existing) {
          skipped++;
          continue;
        }

        // Don't overwrite manually-entered FINAL results with scraper data.
        if (existing.resultStatus === "FINAL" && existing.resultSource === "manual") {
          skipped++;
          continue;
        }

        // Build the update payload based on the mapped status
        const updateData: Record<string, unknown> = {
          resultStatus,
          resultSource: "scraper",
          resultUpdatedAt: nowIso,
        };

        if (resultStatus === "FINAL" || resultStatus === "LIVE") {
          // Store scores if available (LIVE may have partial scores)
          if (r.home_score != null) updateData.homeScore = r.home_score;
          if (r.away_score != null) updateData.awayScore = r.away_score;
        } else {
          // POSTPONED / CANCELLED — clear scores
          updateData.homeScore = null;
          updateData.awayScore = null;
        }

        await db.prediction.update({
          where: { matchId: r.match_id },
          data: updateData,
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
