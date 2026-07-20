import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";
import { computeAnalytics } from "@/lib/analytics";
import { userTotalsSuspended, userWinnerSuspended } from "@/lib/service-config";
export const dynamic = 'force-dynamic';

/**
 * Strip admin-only fields (scatter, calibration, daily, byLeague, lineDeviation)
 * from an AnalyticsSummary so public users only see headline numbers.
 * Preserves the shape needed by PublicStatsBanner.
 */
function publicize(s: ReturnType<typeof computeAnalytics>) {
  return {
    totalPredictions: s.totalPredictions,
    resolved: s.resolved,
    pending: s.pending,
    wins: s.wins,
    losses: s.losses,
    pushes: s.pushes,
    hitRate: s.hitRate,
    roiPercent: s.roiPercent,
    totalStaked: s.totalStaked,
    totalProfit: s.totalProfit,
    currentStreak: s.currentStreak,
    longestWinStreak: s.longestWinStreak,
    longestLossStreak: s.longestLossStreak,
    recentForm: s.recentForm,
    byRecommendation: s.byRecommendation,
  };
}
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    const isOp = role === "ADMIN" || role === "OPERATOR";
    const dbPreds = await db.prediction.findMany({ orderBy: { date: 'asc' } });
    const preds = dbPreds.map((p) => ({
      match_id: p.matchId, home_team: p.homeTeam, away_team: p.awayTeam, country: p.country, league: p.league,
      date: p.date, time: p.time, scope: p.scope, success: p.success,
      validation_errors: JSON.parse(p.validationErrors || '[]'),
      recommendation: p.recommendation, team_winner: p.teamWinner,
      recommendation_confidence: p.recommendationConfidence, team_winner_confidence: p.teamWinnerConfidence,
      confidence: p.confidence, bookmaker_line: p.bookmakerLine,
      over_odds: p.overOdds, under_odds: p.underOdds, home_odds: p.homeOdds, away_odds: p.awayOdds,
      average_rate: p.averageRate, matches_above: p.matchesAbove, matches_below: p.matchesBelow,
      decrement_test: p.decrementTest, increment_test: p.incrementTest,
      h2h_totals: JSON.parse(p.h2hTotals || '[]'), rate_values: JSON.parse(p.rateValues || '[]'),
      winning_streak_data: p.winningStreakData ? JSON.parse(p.winningStreakData) : null,
      bet_code: p.betCode || null,
      home_score: p.homeScore != null ? Number(p.homeScore) : null,
      away_score: p.awayScore != null ? Number(p.awayScore) : null,
      result_status: p.resultStatus || null, result_source: p.resultSource || null,
      result_updated_at: p.resultUpdatedAt ? (typeof p.resultUpdatedAt === 'string' ? p.resultUpdatedAt : new Date(p.resultUpdatedAt).toISOString()) : null,
      created_at: typeof p.createdAt === 'string' ? p.createdAt : new Date(p.createdAt).toISOString(),
    }));
    const totals = computeAnalytics(preds, "TOTALS");
    const winner = computeAnalytics(preds, "WINNER");
    if (isOp) return NextResponse.json({ updated_at: new Date().toISOString(), role: "admin", totals, winner });
    // Public users: return BOTH algorithm buckets SEPARATELY (no combining).
    // The frontend renders two distinct System Track Record cards — one for
    // Over/Under (totals) and one for Win (winner) — per user request.
    // While totals are suspended for users (re-tuning via admin accounts),
    // the totals bucket is omitted entirely so the O/U track-record card
    // hides itself and nothing about the totals market leaks.
    const suspendTotals = await userTotalsSuspended();
    const suspendWinner = await userWinnerSuspended();
    return NextResponse.json({
      updated_at: new Date().toISOString(),
      role: "user",
      ...(suspendTotals ? {} : { totals: publicize(totals) }),
      ...(suspendWinner ? {} : { winner: publicize(winner) }),
    });
  } catch (error) { console.error('[analytics] Error:', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}
