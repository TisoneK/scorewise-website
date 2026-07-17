import { NextResponse } from "next/server";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * GET /api/predictions — Read predictions from Turso DB (persistent).
 *
 * This endpoint reads from the website's own database, NOT from the engine.
 * Predictions are stored in Turso by the webhook receiver when the engine
 * finishes ingesting. This means predictions survive engine redeploys.
 *
 * For regular users: only successful, non-NO_BET predictions are returned,
 * and algorithm internals are stripped.
 *
 * Query params:
 *   ?all=true — return ALL predictions including failed + NO_BET (admin only,
 *               but auth is handled by the caller — this endpoint trusts the
 *               session check done by /api/admin/engine for admin access)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all') === 'true';

    // Fetch from DB
    const dbPreds = await db.prediction.findMany({
      where: all ? {} : { success: true },
      orderBy: { date: 'asc' },
    });

    // Transform DB rows to the Prediction response format
    let predictions: Record<string, unknown>[] = dbPreds.map((p) => ({
      match_id: p.matchId,
      home_team: p.homeTeam,
      away_team: p.awayTeam,
      country: p.country,
      league: p.league,
      date: p.date,
      time: p.time,
      scope: p.scope,
      success: p.success,
      validation_errors: JSON.parse(p.validationErrors || '[]'),
      recommendation: p.recommendation,
      team_winner: p.teamWinner,
      recommendation_confidence: p.recommendationConfidence,
      team_winner_confidence: p.teamWinnerConfidence,
      confidence: p.confidence,
      bookmaker_line: p.bookmakerLine,
      over_odds: p.overOdds,
      under_odds: p.underOdds,
      reduced_over_total: p.reducedOverTotal ?? null,
      reduced_over_odds: p.reducedOverOdds ?? null,
      reduced_under_total: p.reducedUnderTotal ?? null,
      reduced_under_odds: p.reducedUnderOdds ?? null,
      // Audit fields — only visible to admins (the !all branch strips these
      // for regular users via USER_FIELDS allowlist). Used by the admin
      // drawer to show "Source: manual/scraper, updated by X at Y".
      reduced_risk_source: p.reducedRiskSource ?? null,
      reduced_risk_updated_at: p.reducedRiskUpdatedAt
        ? (typeof p.reducedRiskUpdatedAt === 'string' ? p.reducedRiskUpdatedAt : new Date(p.reducedRiskUpdatedAt).toISOString())
        : null,
      reduced_risk_updated_by: p.reducedRiskUpdatedBy ?? null,
      home_odds: p.homeOdds,
      away_odds: p.awayOdds,
      average_rate: p.averageRate,
      matches_above: p.matchesAbove,
      matches_below: p.matchesBelow,
      decrement_test: p.decrementTest,
      increment_test: p.incrementTest,
      h2h_totals: JSON.parse(p.h2hTotals || '[]'),
      rate_values: JSON.parse(p.rateValues || '[]'),
      winning_streak_data: p.winningStreakData ? JSON.parse(p.winningStreakData) : null,
      bet_code: p.betCode || null,
      home_score: p.homeScore ?? null,
      away_score: p.awayScore ?? null,
      result_status: p.resultStatus || null,
      result_source: p.resultSource || null,
      result_updated_at: p.resultUpdatedAt
        ? (typeof p.resultUpdatedAt === 'string' ? p.resultUpdatedAt : new Date(p.resultUpdatedAt).toISOString())
        : null,
      created_at: typeof p.createdAt === 'string' ? p.createdAt : new Date(p.createdAt).toISOString(),
    }));

    const succeeded = predictions.filter(p => p.success).length;
    const failed = predictions.length - succeeded;

    // For regular users (all=false): filter out NO_BET + strip algorithm internals
    if (!all) {
      // Filter out NO_BET
      predictions = predictions.filter(p => p.recommendation && p.recommendation !== 'NO_BET');

      // Strip algorithm internals — but keep the fields needed for Top Picks ranking
      const USER_FIELDS = [
        'match_id', 'home_team', 'away_team', 'country', 'league', 'date', 'time',
        'recommendation', 'confidence', 'bookmaker_line', 'team_winner', 'success',
        'over_odds', 'under_odds', 'home_odds', 'away_odds', 'bet_code',
        'home_score', 'away_score', 'result_status', 'result_source', 'result_updated_at',
        'average_rate', 'matches_above', 'matches_below', 'decrement_test', 'increment_test',
      ];
      predictions = predictions.map((p: Record<string, unknown>) => {
        const stripped: Record<string, unknown> = {};
        for (const field of USER_FIELDS) {
          if (field in p) stripped[field] = p[field];
        }
        return stripped;
      });
    }

    return NextResponse.json({
      updated_at: dbPreds.length > 0
        ? (typeof dbPreds[dbPreds.length - 1].updatedAt === 'string'
            ? dbPreds[dbPreds.length - 1].updatedAt
            : new Date(dbPreds[dbPreds.length - 1].updatedAt).toISOString())
        : null,
      source: 'turso-db',
      total: predictions.length,
      succeeded,
      failed,
      predictions,
    });
  } catch (error) {
    console.error('[predictions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch predictions' },
      { status: 500 },
    );
  }
}
