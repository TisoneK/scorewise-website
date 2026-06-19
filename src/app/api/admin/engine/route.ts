import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * /api/admin/engine — Engine administration endpoints
 *
 * GET — operator+: fetch all predictions (including failed) from Turso DB
 * POST — admin only: forward a single match to engine for prediction
 */

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Read ALL predictions from Turso DB (including failed + NO_BET for admin)
    const dbPreds = await db.prediction.findMany({
      orderBy: { date: 'asc' },
    });

    const predictions = dbPreds.map((p) => ({
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
      created_at: typeof p.createdAt === 'string' ? p.createdAt : new Date(p.createdAt).toISOString(),
    }));

    const succeeded = predictions.filter(p => p.success).length;
    const failed = predictions.length - succeeded;

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
    console.error("[admin/engine] Error:", error);
    return NextResponse.json({ error: "Failed to fetch predictions" }, { status: 500 });
  }
}

// POST — admin only: forward single match to engine (unchanged)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { home_team, away_team, match_total, over_odds, under_odds, home_odds, away_odds, h2h_matches, match_id, country, league, date, time } = body;

    const { getEngineUrl, getEngineApiKey } = await import("@/lib/service-config");
    const ENGINE_URL = await getEngineUrl();
    const API_KEY = await getEngineApiKey();

    if (!API_KEY) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const res = await fetch(`${ENGINE_URL}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
      body: JSON.stringify({
        source: "manual-entry",
        scraped_at: new Date().toISOString(),
        matches: [{
          match_id: match_id || `manual_${Date.now()}`,
          home_team, away_team, country: country || "", league: league || "",
          date: date || "", time: time || "",
          odds: { match_total: parseFloat(match_total), over_odds: over_odds ? parseFloat(over_odds) : null, under_odds: under_odds ? parseFloat(under_odds) : null, home_odds: home_odds ? parseFloat(home_odds) : null, away_odds: away_odds ? parseFloat(away_odds) : null },
          h2h_matches: h2h_matches || [],
        }],
      }),
    });

    const engineResponse = await res.json();
    return NextResponse.json(engineResponse, { status: res.status });
  } catch (error) {
    console.error("[admin/engine] POST error:", error);
    return NextResponse.json({ error: "Failed to submit match" }, { status: 500 });
  }
}
