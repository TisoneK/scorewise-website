import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { readAndVerifyWebhookBodyAsync, type WebhookEnvelope } from "@/lib/webhook-verify";
import { ensureSystemUser } from "@/lib/system-user";
import { db } from "@/lib/db-libsql";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhook/predictions
 *
 * Receiver for the engine's "predictions_updated" webhook.
 *
 * Now stores full prediction data in the Turso DB so predictions survive
 * engine redeploys. The website becomes the source of truth for predictions.
 */

interface PredictionData {
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

interface PredictionsUpdatedData {
  total_predictions?: number;
  succeeded?: number;
  failed?: number;
  source?: string;
  scraped_at?: string;
  ingestion_count?: number;
  predictions?: PredictionData[];
}

export async function POST(request: Request) {
  // 1. Verify HMAC signature
  const envelope = await readAndVerifyWebhookBodyAsync<WebhookEnvelope<PredictionsUpdatedData>>(request);
  if (!envelope) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (envelope.event !== "predictions_updated") {
    return NextResponse.json({ error: `Unexpected event '${envelope.event}'` }, { status: 400 });
  }

  const data = envelope.data || {};
  console.log("[webhook/predictions] Received:", {
    total: data.total_predictions,
    predictions_count: data.predictions?.length || 0,
    source: data.source,
  });

  let stored = 0;
  let updated = 0;
  let errors = 0;

  // 2. Upsert predictions into Turso DB
  if (data.predictions && Array.isArray(data.predictions)) {
    for (const p of data.predictions) {
      try {
        const existing = await db.prediction.findUnique({
          where: { matchId: p.match_id },
        });

        const payload = {
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
          reducedOverTotal: p.reduced_over_total ?? null,
          reducedOverOdds: p.reduced_over_odds ?? null,
          reducedUnderTotal: p.reduced_under_total ?? null,
          reducedUnderOdds: p.reduced_under_odds ?? null,
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
          source: data.source || "flashscore-scraper",
        };

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
        console.error(`[webhook/predictions] Failed to upsert ${p.match_id}:`, err);
        errors++;
      }
    }
  }

  // 3. Invalidate caches
  try {
    revalidatePath("/api/predictions");
    revalidatePath("/");
  } catch (e) {
    console.warn("[webhook/predictions] revalidatePath failed:", e);
  }

  // 4. Log to activity log
  try {
    const systemUserId = await ensureSystemUser();
    if (systemUserId) {
      await db.activityLog.create({
        data: {
          userId: systemUserId,
          action: "ENGINE_PREDICTIONS_UPDATED",
          service: "engine",
          details: JSON.stringify({
            total: data.total_predictions ?? 0,
            succeeded: data.succeeded ?? 0,
            failed: data.failed ?? 0,
            stored_new: stored,
            updated_existing: updated,
            errors,
            source: data.source ?? null,
            scraped_at: data.scraped_at ?? null,
          }),
        },
      });
    }
  } catch (e) {
    console.error("[webhook/predictions] Activity log failed:", e);
  }

  return NextResponse.json({
    status: "ok",
    stored_new: stored,
    updated_existing: updated,
    errors,
    total_in_db: stored + updated,
  });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
