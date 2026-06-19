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
 */

import type { Prediction } from "@/lib/types";

export type OverUnderOutcome = "WIN" | "LOSS" | "PUSH" | "MISSING";
export type WinnerOutcome = "WIN" | "LOSS" | "MISSING";

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
