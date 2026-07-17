import { db } from "@/lib/db-libsql";

/**
 * Shared upsert logic for prediction payloads coming FROM THE ENGINE —
 * used by both delivery paths:
 *   - push: POST /api/webhook/predictions (engine → website webhook)
 *   - pull: POST /api/admin/engine/sync   (website pulls engine's store)
 *
 * Keeping one implementation guarantees the two paths can never drift —
 * manual-override protection and single-side reduced-line normalization
 * apply identically no matter how a prediction arrives.
 */

export interface EnginePrediction {
  match_id: string;
  home_team?: string;
  away_team?: string;
  country?: string;
  league?: string;
  date?: string;
  time?: string;
  scope?: string;
  success?: boolean;
  validation_errors?: string[];
  recommendation?: string | null;
  team_winner?: string | null;
  recommendation_confidence?: string | null;
  team_winner_confidence?: string | null;
  confidence?: string | null;
  bookmaker_line?: number | null;
  over_odds?: number | null;
  under_odds?: number | null;
  // Reduced-risk (alternative) lines — scraped from Flashscore, only for Totals
  reduced_over_total?: number | null;
  reduced_over_odds?: number | null;
  reduced_under_total?: number | null;
  reduced_under_odds?: number | null;
  home_odds?: number | null;
  away_odds?: number | null;
  average_rate?: number;
  matches_above?: number;
  matches_below?: number;
  decrement_test?: number;
  increment_test?: number;
  h2h_totals?: number[];
  rate_values?: number[];
  winning_streak_data?: unknown;
  created_at?: string | null;
}

export interface UpsertCounts {
  stored: number;
  updated: number;
  errors: number;
}

export async function upsertEnginePredictions(
  preds: EnginePrediction[],
  source: string,
  logTag: string,
): Promise<UpsertCounts> {
  let stored = 0;
  let updated = 0;
  let errors = 0;

  for (const p of preds) {
    try {
      const existing = await db.prediction.findUnique({
        where: { matchId: p.match_id },
      });

      // Base payload — every field the scraper is authoritative for.
      // Reduced-risk fields are conditional (see below) so a manual
      // admin/operator override is NOT clobbered by the next scrape.
      const payload: Record<string, unknown> = {
        matchId: p.match_id,
        homeTeam: p.home_team || "",
        awayTeam: p.away_team || "",
        country: p.country || "",
        league: p.league || "",
        date: p.date || "",
        time: p.time || "",
        scope: p.scope || "FULL_MATCH",
        success: p.success ?? true,
        validationErrors: JSON.stringify(p.validation_errors || []),
        recommendation: p.recommendation || null,
        teamWinner: p.team_winner || null,
        recommendationConfidence: p.recommendation_confidence || null,
        teamWinnerConfidence: p.team_winner_confidence || null,
        confidence: p.confidence || null,
        bookmakerLine: p.bookmaker_line ?? null,
        overOdds: p.over_odds ?? null,
        underOdds: p.under_odds ?? null,
        homeOdds: p.home_odds ?? null,
        awayOdds: p.away_odds ?? null,
        averageRate: p.average_rate ?? 0,
        matchesAbove: p.matches_above ?? 0,
        matchesBelow: p.matches_below ?? 0,
        decrementTest: p.decrement_test ?? 0,
        incrementTest: p.increment_test ?? 0,
        h2hTotals: JSON.stringify(p.h2h_totals || []),
        rateValues: JSON.stringify(p.rate_values || []),
        winningStreakData: p.winning_streak_data ? JSON.stringify(p.winning_streak_data) : null,
        source,
      };

      // Reduced-risk fields: skip if a manual override is in place.
      // The admin/operator explicitly entered these because the scraped
      // source diverged from the betting site — letting the scraper
      // overwrite them would defeat the entire feature.
      // See /api/admin/predictions/reduced-risk for the manual writer.
      const hasManualOverride = existing?.reducedRiskSource === "manual";
      if (!hasManualOverride) {
        // Only the reduced pair on the RECOMMENDED side is stored — an
        // UNDER pick has no use for a reduced OVER line and vice versa.
        // The engine already drops the off-side pair; this normalization
        // is defense-in-depth against older engine deploys sending both.
        const rec = (p.recommendation || "").toUpperCase();
        payload.reducedOverTotal = rec === "OVER" ? p.reduced_over_total ?? null : null;
        payload.reducedOverOdds = rec === "OVER" ? p.reduced_over_odds ?? null : null;
        payload.reducedUnderTotal = rec === "UNDER" ? p.reduced_under_total ?? null : null;
        payload.reducedUnderOdds = rec === "UNDER" ? p.reduced_under_odds ?? null : null;
        // Only stamp "scraper" source if there's something to record.
        // Empty arrays/null payloads from the scraper shouldn't pretend
        // to have set anything.
        const hasAnyReduced =
          payload.reducedOverTotal != null ||
          payload.reducedOverOdds != null ||
          payload.reducedUnderTotal != null ||
          payload.reducedUnderOdds != null;
        if (hasAnyReduced) {
          payload.reducedRiskSource = "scraper";
          payload.reducedRiskUpdatedAt = new Date();
          payload.reducedRiskUpdatedBy = null;
        }
      } else if (existing) {
        // Preserve the existing manual values — DO NOT touch the 4
        // reduced-risk fields or the audit columns. The payload above
        // already omits them, so update() will leave them alone.
        console.log(
          `[${logTag}] ${p.match_id}: preserving manual reduced-risk override (skipped scraper values)`,
        );
      }

      if (existing) {
        await db.prediction.update({
          where: { matchId: p.match_id },
          data: payload,
        });
        updated++;
      } else {
        await db.prediction.create({ data: payload });
        stored++;
      }
    } catch (err) {
      console.error(`[${logTag}] Failed to upsert ${p.match_id}:`, err);
      errors++;
    }
  }

  return { stored, updated, errors };
}
