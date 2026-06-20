import { NextResponse } from "next/server";
import { db } from "@/lib/db-libsql";
import { parseMatchDateTime } from "@/lib/timezone";

export const dynamic = 'force-dynamic';

/**
 * GET /api/predictions/exists
 *
 * Returns the set of match_ids that already have predictions in the DB.
 * Used by the scraper to:
 *   1. Skip matches that have already been scraped + predicted
 *   2. Sort matches by priority (FINISHED > LIVE > SCHEDULED) so users
 *      see final results first
 *
 * No auth required — this endpoint only returns match_id strings + time info
 * (no prediction data like recommendations or odds).
 *
 * Query params:
 *   ?with_priority=true — include date/time/effective_status for each match
 *     so the scraper can sort by priority before processing
 *
 * Returns (without ?with_priority):
 *   { match_ids: ["abc123", ...], count: N }
 *
 * Returns (with ?with_priority=true):
 *   {
 *     match_ids: ["abc123", ...],
 *     count: N,
 *     matches: [
 *       { match_id, date, time, effective_status: "AWAITING_RESULT" | "LIVE" | "PENDING" | "FINAL" },
 *       ...
 *     ],
 *     by_priority: {
 *       high: [...],   // AWAITING_RESULT — likely finished, need final scores
 *       medium: [...], // LIVE — in-progress, need live score updates
 *       low: [...],    // PENDING — scheduled, haven't started yet
 *       done: [...],   // FINAL — already has final score, skip
 *     }
 *   }
 *
 * Priority levels (based on match start time + stored result_status):
 *   HIGH (AWAITING_RESULT): start_time + 2h50m < now, no FINAL yet → most likely finished
 *   MEDIUM (LIVE): start_time <= now < start_time + 2h50m → in-progress, need live scores
 *   LOW (PENDING): start_time > now → hasn't started, lowest priority
 *   DONE (FINAL): already has result_status = FINAL → skip entirely
 */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const withPriority = searchParams.get('with_priority') === 'true';
    // Optional: override the match duration threshold (in minutes).
    // Default 170 (2h50m). The scraper passes its RESULTS_MATCH_DURATION_MINUTES
    // config value here so both sides use the same threshold.
    const matchDurationMin = parseInt(searchParams.get('match_duration') || '170', 10);
    const MATCH_DURATION_MS = (isNaN(matchDurationMin) ? 170 : matchDurationMin) * 60 * 1000;

    if (!withPriority) {
      // Original behavior — just return match_id strings
      const rows = await db.prediction.findMany({
        select: { matchId: true },
      });
      const match_ids = rows.map(r => r.matchId);
      return NextResponse.json({ match_ids, count: match_ids.length });
    }

    // Enhanced behavior — return matches with priority info
    const rows = await db.prediction.findMany({
      select: { matchId: true, date: true, time: true, resultStatus: true },
    });

    const now = Date.now();
    const by_priority: {
      high: { match_id: string; date: string; time: string; effective_status: string }[];
      medium: { match_id: string; date: string; time: string; effective_status: string }[];
      low: { match_id: string; date: string; time: string; effective_status: string }[];
      done: { match_id: string; date: string; time: string; effective_status: string }[];
    } = { high: [], medium: [], low: [], done: [] };

    const matches: { match_id: string; date: string; time: string; effective_status: string }[] = [];

    for (const r of rows) {
      const matchDate = parseMatchDateTime(r.date, r.time);
      let effectiveStatus = 'PENDING';

      // If already FINAL/POSTPONED/CANCELLED, it's done
      if (r.resultStatus === 'FINAL' || r.resultStatus === 'POSTPONED' || r.resultStatus === 'CANCELLED') {
        effectiveStatus = r.resultStatus;
      } else if (matchDate) {
        const startMs = matchDate.getTime();
        const likelyFinishedMs = startMs + MATCH_DURATION_MS;
        if (now < startMs) {
          effectiveStatus = 'PENDING';
        } else if (now < likelyFinishedMs) {
          effectiveStatus = 'LIVE';
        } else {
          effectiveStatus = 'AWAITING_RESULT';
        }
      }

      const entry = {
        match_id: r.matchId,
        date: r.date || '',
        time: r.time || '',
        effective_status: effectiveStatus,
      };
      matches.push(entry);

      // Bucket by priority
      if (effectiveStatus === 'FINAL' || effectiveStatus === 'POSTPONED' || effectiveStatus === 'CANCELLED') {
        by_priority.done.push(entry);
      } else if (effectiveStatus === 'AWAITING_RESULT') {
        by_priority.high.push(entry);
      } else if (effectiveStatus === 'LIVE') {
        by_priority.medium.push(entry);
      } else {
        by_priority.low.push(entry);
      }
    }

    const match_ids = rows.map(r => r.matchId);

    return NextResponse.json({
      match_ids,
      count: match_ids.length,
      matches,
      by_priority: {
        high: by_priority.high,
        medium: by_priority.medium,
        low: by_priority.low,
        done: by_priority.done,
      },
      priority_counts: {
        high: by_priority.high.length,
        medium: by_priority.medium.length,
        low: by_priority.low.length,
        done: by_priority.done.length,
      },
    });
  } catch (error) {
    console.error('[predictions/exists] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch existing match IDs' },
      { status: 500 },
    );
  }
}
