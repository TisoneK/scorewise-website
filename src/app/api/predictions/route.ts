import { NextResponse } from "next/server";
import { getEngineUrl, getEngineApiKey } from "@/lib/service-config";

export const dynamic = 'force-dynamic';

/**
 * Fields exposed to regular users (NON-admins).
 * Algorithm internals are stripped for security — users should only see
 * the prediction output, not the engine's computation details.
 */
const USER_FIELDS = [
  "match_id", "home_team", "away_team", "country", "league", "date", "time",
  "recommendation", "confidence", "bookmaker_line", "team_winner", "success",
];

// GET /api/predictions — Proxy to engine (successful predictions only, for regular users)
export async function GET() {
  try {
    const ENGINE_URL = await getEngineUrl();
    const API_KEY = await getEngineApiKey();

    if (!API_KEY) {
      return NextResponse.json(
        { error: "Service not configured", detail: "API key is missing. Contact an admin to configure the engine API key." },
        { status: 503 }
      );
    }

    const res = await fetch(`${ENGINE_URL}/api/predictions?successful_only=true`, {
      headers: { "X-API-Key": API_KEY },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: "Authentication failed", detail: "The engine API key is invalid. An admin needs to update it in the configuration panel." },
          { status: 502 }
        );
      }
      const errorBody = await res.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: `Engine returned ${res.status}`, detail: errorBody },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Strip algorithm internals from each prediction before sending to users.
    // Users see: teams, league, country, date, time, recommendation,
    // confidence, bookmaker line, team winner.
    // Users do NOT see: average_rate, matches_above/below, dec/inc tests,
    // h2h_totals, rate_values, winning_streak_data, validation_errors,
    // recommendation_confidence, team_winner_confidence, scope, created_at.
    if (data.predictions && Array.isArray(data.predictions)) {
      // Filter out NO_BET — useless to users, they only want actionable predictions
      data.predictions = (data.predictions as Record<string, unknown>[])
        .filter((p) => p.recommendation !== "NO_BET")
        .map((p: Record<string, unknown>) => {
        const stripped: Record<string, unknown> = {};
        for (const field of USER_FIELDS) {
          if (field in p) stripped[field] = p[field];
        }
        return stripped;
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[predictions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch predictions", detail: "Could not connect to the prediction engine. Please try again later." },
      { status: 502 }
    );
  }
}
