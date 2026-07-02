/**
 * result-utils.ts — helpers for computing prediction outcomes from final scores.
 *
 * Given a Prediction with home_score, away_score, bookmaker_line, and
 * recommendation, computeOutcome() returns:
 *   - "WIN"  — the prediction was correct
 *   - "LOSS" — the prediction was wrong
 *   - "PUSH" — the total exactly equaled the line (bet refunded)
 *   - "MISSING" — result not yet available (PENDING / LIVE / no scores)
 *
 * For team_winner:
 *   - "WIN"  — predicted team won
 *   - "LOSS" — predicted team lost or drew (basketball rarely draws)
 *   - "MISSING" — result not final
 *
 * computeEffectiveStatus() derives the current status from the match's
 * start time + stored result_status — so users see LIVE the moment a
 * match kicks off, even if no one has manually updated the DB.
 */

import type { Prediction } from "@/lib/types";
import { parseMatchDateTime } from "@/lib/timezone";

export type OverUnderOutcome = "WIN" | "LOSS" | "PUSH" | "MISSING";
export type WinnerOutcome = "WIN" | "LOSS" | "MISSING";

/** Effective status — what the UI should display, derived from DB status + current time. */
export type EffectiveStatus =
  | "PENDING"          // not started yet (or no start time)
  | "LIVE"             // in progress (start_time <= now < start_time + 2h50m)
  | "AWAITING_RESULT"  // finished but no final score yet (now >= start_time + 2h50m, status not FINAL)
  | "FINAL"            // has final score
  | "POSTPONED"
  | "CANCELLED";

/** Basketball match duration: ~2h-2h50m. Used as the "likely finished" threshold. */
const MATCH_DURATION_MS = 2 * 60 * 60 * 1000 + 50 * 60 * 1000; // 2h50m

/**
 * Compute the effective status of a match based on its stored result_status
 * and the current time relative to its start time.
 *
 * Rules (in order of precedence):
 *   1. If result_status is FINAL/POSTPONED/CANCELLED → return it as-is
 *   2. If result_status is LIVE (manually set) → return LIVE
 *   3. If no start time → return result_status || PENDING
 *   4. If now < start_time → PENDING (upcoming)
 *   5. If start_time <= now < start_time + 2h50m → LIVE (in progress)
 *   6. If now >= start_time + 2h50m → AWAITING_RESULT (finished, waiting for score)
 *
 * This means users see LIVE the moment a match kicks off, without anyone
 * needing to manually update the DB. The scraper's cron job will eventually
 * fetch the final score and flip it to FINAL.
 */
export function computeEffectiveStatus(p: Prediction, now: Date = new Date()): EffectiveStatus {
  const stored = (p.result_status as EffectiveStatus | null) || null;

  // Manual overrides — respect them as-is
  if (stored === "FINAL" || stored === "POSTPONED" || stored === "CANCELLED") {
    return stored;
  }
  if (stored === "LIVE") {
    return "LIVE";
  }

  // For PENDING/null, derive from time
  const matchDate = parseMatchDateTime(p.date, p.time);
  if (!matchDate) {
    return stored || "PENDING";
  }

  const nowMs = now.getTime();
  const startMs = matchDate.getTime();
  const likelyFinishedMs = startMs + MATCH_DURATION_MS;

  if (nowMs < startMs) {
    return "PENDING";
  }
  if (nowMs < likelyFinishedMs) {
    return "LIVE";
  }
  return "AWAITING_RESULT";
}

/** True if the match is currently in progress (LIVE). */
export function isLive(p: Prediction, now: Date = new Date()): boolean {
  return computeEffectiveStatus(p, now) === "LIVE";
}

/** True if the match should have a final score by now (start + 2h50m < now) but doesn't yet. */
export function isAwaitingResult(p: Prediction, now: Date = new Date()): boolean {
  return computeEffectiveStatus(p, now) === "AWAITING_RESULT";
}


/**
 * Compute the OVER/UNDER outcome for a prediction.
 *
 * - Returns MISSING if scores are null, result is not FINAL, or no recommendation
 *   or bookmaker_line was made.
 * - Returns PUSH if total === bookmaker_line (refund scenario).
 * - Returns WIN if recommendation was OVER and total > bookmaker_line, OR
 *   recommendation was UNDER and total < bookmaker_line.
 * - Returns LOSS otherwise.
 */
export function computeOverUnderOutcome(p: Prediction): OverUnderOutcome {
  if (p.result_status !== "FINAL") return "MISSING";
  if (p.home_score == null || p.away_score == null) return "MISSING";
  if (p.bookmaker_line == null) return "MISSING";

  const rec = p.recommendation?.toUpperCase();
  if (rec !== "OVER" && rec !== "UNDER") return "MISSING";

  const total = p.home_score + p.away_score;
  if (total === p.bookmaker_line) return "PUSH";
  if (rec === "OVER" && total > p.bookmaker_line) return "WIN";
  if (rec === "UNDER" && total < p.bookmaker_line) return "WIN";
  return "LOSS";
}

/**
 * Compute the OVER/UNDER outcome using the best available line.
 *
 * Risk hierarchy (PRIMARY → FALLBACK):
 *   1. REDUCED-RISK line (scraped alternative line — e.g., UNDER 178.5)
 *      This is the primary line for users. Gives a 2-point buffer that
 *      turns narrow losses into wins. Odds ~1.70.
 *   2. STANDARD line (bookmaker_line — e.g., 176.5)
 *      Fallback when no reduced-risk line was scraped. This is the
 *      "middle risk" — the default bookmaker line. Odds ~1.85.
 *   3. HIGH-RISK line (never used currently — reserved for future)
 *      Would be the opposite alternative (e.g., UNDER 174.5 for a
 *      176.5 standard line). Better odds but harder to win.
 *
 * Old predictions (before reduced-risk scraping was added) have null
 * reduced-risk fields, so they fall back to the standard line. This
 * ensures the full history is included in stats without bias.
 *
 * Only applies to Totals (O/U) predictions — NOT 1X2/moneyline.
 */
export function computeReducedRiskOutcome(p: Prediction): OverUnderOutcome {
  if (p.result_status !== "FINAL") return "MISSING";
  if (p.home_score == null || p.away_score == null) return "MISSING";

  const rec = p.recommendation?.toUpperCase();
  if (rec !== "OVER" && rec !== "UNDER") return "MISSING";

  // Pick the right reduced-risk line based on the recommendation
  const reducedLine = rec === "OVER" ? p.reduced_over_total : p.reduced_under_total;
  // Fall back to standard (middle-risk) line if no reduced-risk line available
  const effectiveLine = reducedLine ?? p.bookmaker_line;
  if (effectiveLine == null) return "MISSING";

  const total = p.home_score + p.away_score;
  if (total === effectiveLine) return "PUSH";
  if (rec === "OVER" && total > effectiveLine) return "WIN";
  if (rec === "UNDER" && total < effectiveLine) return "WIN";
  return "LOSS";
}

/**
 * Compute the team-winner outcome for a prediction.
 *
 * - Returns MISSING if scores are null, result is not FINAL, or no team_winner
 *   was predicted.
 * - Returns WIN if the predicted team (HOME_TEAM or AWAY_TEAM) has the higher score.
 * - Returns LOSS otherwise (predicted team lost, or draw).
 */
export function computeWinnerOutcome(p: Prediction): WinnerOutcome {
  if (p.result_status !== "FINAL") return "MISSING";
  if (p.home_score == null || p.away_score == null) return "MISSING";

  const winner = p.team_winner?.toUpperCase();
  if (winner !== "HOME_TEAM" && winner !== "AWAY_TEAM") return "MISSING";

  if (winner === "HOME_TEAM" && p.home_score > p.away_score) return "WIN";
  if (winner === "AWAY_TEAM" && p.away_score > p.home_score) return "WIN";
  return "LOSS";
}

/**
 * Human-readable summary of the outcome, e.g.:
 *   "OVER 187.5 — Actual 195 — WIN ✓"
 *   "UNDER 162.5 — Actual 158 — WIN ✓"
 *   "UNDER 162.5 — Actual 168 — LOSS ✗"
 *   "Total 187.5 — Push (refund)"
 *   "Pending" / "Live (45-38)" / etc.
 */
export function describeOutcome(p: Prediction): string {
  if (p.result_status === "PENDING" || !p.result_status) {
    return "Pending";
  }
  if (p.result_status === "POSTPONED") return "Postponed";
  if (p.result_status === "CANCELLED") return "Cancelled";
  if (p.result_status === "LIVE") {
    return `Live ${p.home_score ?? 0}-${p.away_score ?? 0}`;
  }
  if (p.result_status === "FINAL") {
    if (p.home_score == null || p.away_score == null) return "Final";
    const total = p.home_score + p.away_score;
    const ou = computeOverUnderOutcome(p);
    if (ou === "MISSING") return `Final ${p.home_score}-${p.away_score}`;
    if (ou === "PUSH") return `Final ${p.home_score}-${p.away_score} · Total ${total} = line ${p.bookmaker_line} · Push`;
    const rec = p.recommendation?.toUpperCase();
    const symbol = ou === "WIN" ? "✓" : "✗";
    return `Final ${p.home_score}-${p.away_score} · Total ${total} · ${rec} ${ou} ${symbol}`;
  }
  return "Unknown";
}

/**
 * Color class for the outcome badge (matches the site's neon-* palette).
 */
export function outcomeColor(outcome: OverUnderOutcome | WinnerOutcome): string {
  switch (outcome) {
    case "WIN": return "text-neon-green border-neon-green/30 bg-neon-green/10";
    case "LOSS": return "text-neon-red border-neon-red/30 bg-neon-red/10";
    case "PUSH": return "text-neon-yellow border-neon-yellow/30 bg-neon-yellow/10";
    default: return "text-muted-foreground border-border/40";
  }
}
