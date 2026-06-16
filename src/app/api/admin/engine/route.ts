import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEngineUrl, getEngineApiKey } from "@/lib/service-config";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * /api/admin/engine — Engine administration endpoints
 *
 * GET    — operator+ : fetch all predictions (including failed)
 * POST   — admin only: forward a single match's data to the engine for
 *          immediate prediction. Uses /api/ingest (not /predict) so the
 *          result is stored in the engine's prediction store and triggers
 *          the Phase 4 webhook back to the website (cache invalidation +
 *          activity log entry).
 * DELETE — admin only: documentation-only endpoint (no engine DELETE route exists)
 */

// ---------------------------------------------------------------------------
// GET — operator and above
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Unauthorized — operator access or above required" }, { status: 401 });
    }

    const ENGINE_URL = await getEngineUrl();
    const API_KEY = await getEngineApiKey();

    if (!API_KEY) {
      return NextResponse.json({ error: "API key not configured. Go to Configuration tab to set it." }, { status: 500 });
    }

    // Fetch all predictions (not just successful) for admin view
    const res = await fetch(`${ENGINE_URL}/api/predictions`, {
      headers: { "X-API-Key": API_KEY },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json(
        { error: `Engine returned ${res.status}`, detail: errorBody },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[admin/engine] Error:", error);
    return NextResponse.json({ error: "Failed to fetch engine data" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — admin only: submit a single match for immediate prediction
// ---------------------------------------------------------------------------

/**
 * Expected request body:
 *   {
 *     match_id: string,
 *     home_team: string,
 *     away_team: string,
 *     odds: {
 *       match_total: number,        // must end in .5
 *       over_odds?: number,
 *       under_odds?: number,
 *       home_odds?: number,
 *       away_odds?: number,
 *     },
 *     h2h_matches: Array<{
 *       home_team: string,
 *       away_team: string,
 *       home_score: number,
 *       away_score: number,
 *       date: string,               // YYYY-MM-DD
 *     }>,
 *   }
 *
 * Forwards to the engine's POST /api/ingest with source="manual_entry".
 * Returns the engine's IngestResponse (single match).
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized — admin access required" }, { status: 401 });
    }

    const ENGINE_URL = await getEngineUrl();
    const API_KEY = await getEngineApiKey();

    if (!API_KEY) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    // Parse and validate the incoming match payload
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validationError = validateMatchPayload(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 422 });
    }
    const match = body as ManualMatchPayload;

    // Build the engine ingest payload (single-match batch)
    const ingestPayload = {
      source: "manual_entry",
      scraped_at: new Date().toISOString(),
      matches: [
        {
          match_id: match.match_id,
          home_team: match.home_team,
          away_team: match.away_team,
          odds: match.odds,
          h2h_matches: match.h2h_matches || [],
        },
      ],
    };

    // Forward to engine
    const res = await fetch(`${ENGINE_URL}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(ingestPayload),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Surface engine's error detail if present
      const detail = (data as { detail?: string }).detail || `Engine returned ${res.status}`;
      return NextResponse.json(
        { error: "Engine rejected the submission", detail },
        { status: res.status },
      );
    }

    // Log the action
    await db.activityLog.create({
      data: {
        userId: (session.user as { id: string }).id,
        action: "SERVICE_TRIGGER",
        service: "engine",
        details: JSON.stringify({
          operation: "manual_predict",
          match_id: match.match_id,
          home_team: match.home_team,
          away_team: match.away_team,
          engine_response: {
            total: data.total,
            succeeded: data.succeeded,
            failed: data.failed,
            added: data.added,
            updated: data.updated,
            store_total: data.store_total,
          },
        }),
      },
    });

    return NextResponse.json({
      status: "ok",
      message: `Prediction generated for ${match.home_team} vs ${match.away_team}`,
      engine_response: data,
    });
  } catch (error) {
    console.error("[admin/engine] POST error:", error);
    return NextResponse.json({ error: "Failed to submit match to engine" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — admin only: documentation-only (no engine DELETE endpoint exists)
// ---------------------------------------------------------------------------

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized — admin access required" }, { status: 401 });
    }

    const ENGINE_URL = await getEngineUrl();
    const API_KEY = await getEngineApiKey();

    if (!API_KEY) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    // Log the action
    await db.activityLog.create({
      data: {
        userId: (session.user as { id: string }).id,
        action: "SERVICE_TRIGGER",
        service: "engine",
        details: JSON.stringify({ operation: "clear_predictions" }),
      },
    });

    // The engine doesn't have a DELETE endpoint, so we return method info
    return NextResponse.json({
      message: "Use the engine's /api/predictions/download endpoint to export data before clearing. Clear predictions by re-ingesting empty data.",
      engineUrl: ENGINE_URL,
    });
  } catch (error) {
    console.error("[admin/engine] Error:", error);
    return NextResponse.json({ error: "Failed to clear engine data" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Payload validation — server-side guard before forwarding to engine
// ---------------------------------------------------------------------------

interface ManualMatchPayload {
  match_id: string;
  home_team: string;
  away_team: string;
  odds: {
    match_total: number;
    over_odds?: number;
    under_odds?: number;
    home_odds?: number;
    away_odds?: number;
  };
  h2h_matches?: Array<{
    home_team: string;
    away_team: string;
    home_score: number;
    away_score: number;
    date: string;
  }>;
}

function validateMatchPayload(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return "Body must be a JSON object";
  }
  const m = body as Record<string, unknown>;

  // Required top-level string fields
  for (const field of ["match_id", "home_team", "away_team"]) {
    const v = m[field];
    if (typeof v !== "string" || v.trim().length === 0) {
      return `Field '${field}' must be a non-empty string`;
    }
  }

  // Odds is required and must have match_total ending in .5
  if (!m.odds || typeof m.odds !== "object") {
    return "Field 'odds' is required and must be an object";
  }
  const odds = m.odds as Record<string, unknown>;
  if (typeof odds.match_total !== "number" || !isFinite(odds.match_total) || odds.match_total <= 0) {
    return "odds.match_total must be a positive finite number";
  }
  // Bookmaker lines must end in .5 — engine will reject otherwise
  if (Math.abs((odds.match_total % 1) - 0.5) > 1e-9) {
    return "odds.match_total must end in .5 (e.g. 174.5, 217.5)";
  }
  // Optional odds — must be positive numbers if present
  for (const f of ["over_odds", "under_odds", "home_odds", "away_odds"]) {
    const v = odds[f];
    if (v !== undefined && v !== null) {
      if (typeof v !== "number" || !isFinite(v) || v <= 0) {
        return `odds.${f} must be a positive number (or omitted)`;
      }
    }
  }

  // h2h_matches — optional but if present must be a valid array
  if (m.h2h_matches !== undefined && m.h2h_matches !== null) {
    if (!Array.isArray(m.h2h_matches)) {
      return "Field 'h2h_matches' must be an array";
    }
    if (m.h2h_matches.length > 100) {
      return "Field 'h2h_matches' cannot exceed 100 entries";
    }
    for (let i = 0; i < m.h2h_matches.length; i++) {
      const h = m.h2h_matches[i] as Record<string, unknown>;
      if (!h || typeof h !== "object") {
        return `h2h_matches[${i}] must be an object`;
      }
      for (const f of ["home_team", "away_team"]) {
        if (typeof h[f] !== "string" || (h[f] as string).trim().length === 0) {
          return `h2h_matches[${i}].${f} must be a non-empty string`;
        }
      }
      for (const f of ["home_score", "away_score"]) {
        if (typeof h[f] !== "number" || !Number.isInteger(h[f]) || h[f] < 0 || h[f] > 300) {
          return `h2h_matches[${i}].${f} must be an integer in [0, 300]`;
        }
      }
      if (typeof h.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) {
        return `h2h_matches[${i}].date must be in YYYY-MM-DD format`;
      }
    }
  }

  return null; // valid
}
