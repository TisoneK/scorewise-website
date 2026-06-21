import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import { getScraperUrl } from "@/lib/service-config";
import { db } from "@/lib/db-libsql";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel cron functions can run up to 60s on Pro plan

/**
 * GET /api/cron/scrape-results
 *
 * Vercel cron job — called automatically every 10 minutes by vercel.json
 * (if on Pro plan). Also callable manually via GET with ?secret=CRON_SECRET.
 *
 * What it does:
 *   1. Query the Turso DB for matches where:
 *      - result_status is null/PENDING/LIVE (not FINAL/POSTPONED/CANCELLED)
 *      - AND start_time + 2h50m < now (match should be finished by now)
 *   2. If any matches match, trigger the scraper's POST /api/scrape/results
 *      for today's date (the scraper fetches ALL match IDs from /api/predictions/exists,
 *      so it'll cover matches from any date — we just pass today's date as a hint).
 *   3. The scraper pushes final scores back via /api/webhook/result (HMAC-signed).
 *   4. The webhook receiver updates the DB with result_status = FINAL.
 *
 * Auth:
 *   - Vercel cron jobs send an `Authorization: Bearer <CRON_SECRET>` header.
 *     We verify it matches process.env.CRON_SECRET OR the ServiceConfig DB row
 *     (service='website', key='cron_secret'). The DB fallback lets admins set
 *     the secret via the Config tab without a Vercel redeploy.
 *   - For manual testing, accept ?secret=<CRON_SECRET> as a query param.
 *   - If CRON_SECRET is not set anywhere, the endpoint 500s (fail-closed).
 *
 * Idempotent: safe to call multiple times — the scraper skips matches that
 * aren't 'finished' yet, and the webhook receiver doesn't overwrite manual
 * FINAL entries.
 */
export async function GET(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  // Check ServiceConfig DB first (admin-managed via Config tab), then env var.
  let cronSecret = process.env.CRON_SECRET || "";
  if (!cronSecret) {
    try {
      const row = await db.serviceConfig.findUnique({
        where: { service_key: { service: "website", key: "cron_secret" } },
      });
      cronSecret = row?.value || "";
    } catch {
      // DB read failed — fall through to env check
    }
  }

  if (!cronSecret) {
    console.error("[cron/scrape-results] CRON_SECRET not set in env or ServiceConfig DB");
    return NextResponse.json(
      {
        error: "CRON_SECRET not configured.",
        hint: "Set it via the admin Config tab (service=website, key=cron_secret) or as a Vercel env var.",
      },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret") || "";
  const providedSecret = authHeader.replace(/^Bearer\s+/i, "") || querySecret;

  if (providedSecret !== cronSecret) {
    console.warn("[cron/scrape-results] Unauthorized — invalid or missing secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Find matches that need results ─────────────────────────────────────
  // Match should be finished: start_time + 2h50m < now
  // And not already FINAL/POSTPONED/CANCELLED
  const MATCH_DURATION_MS = 2 * 60 * 60 * 1000 + 50 * 60 * 1000; // 2h50m
  const now = Date.now();
  const threshold = new Date(now - MATCH_DURATION_MS).toISOString();

  let matchesNeedingResults = 0;
  let sampleMatchIds: string[] = [];

  try {
    const turso = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // Find matches where the start time has passed + likely-finished threshold
    // AND the result isn't already FINAL/POSTPONED/CANCELLED.
    // date is stored as DD.MM.YYYY, time as HH:MM. We can't directly compare
    // these in SQL, so we pull all non-final predictions and filter in JS.
    const rs = await turso.execute({
      sql: `SELECT matchId, homeTeam, awayTeam, date, time, resultStatus
            FROM Prediction
            WHERE resultStatus IS NULL
               OR resultStatus = ''
               OR resultStatus = 'PENDING'
               OR resultStatus = 'LIVE'`,
      args: [],
    });

    const needingResults: { matchId: string; homeTeam: string; awayTeam: string; date: string; time: string }[] = [];
    for (const row of rs.rows) {
      const dateStr = row.date as string;
      const timeStr = row.time as string;
      if (!dateStr) continue;

      // Parse DD.MM.YYYY + HH:MM as UTC
      const dateParts = dateStr.split(".");
      if (dateParts.length !== 3) continue;
      const [day, month, year] = dateParts.map(Number);
      let hour = 0, minute = 0;
      if (timeStr) {
        const timeParts = timeStr.split(":");
        if (timeParts.length >= 2) {
          hour = parseInt(timeParts[0]) || 0;
          minute = parseInt(timeParts[1]) || 0;
        }
      }
      const matchStart = Date.UTC(year, month - 1, day, hour, minute);
      if (isNaN(matchStart)) continue;

      // Scrape matches that have STARTED (now > start_time):
      //   - LIVE: now is between start and start+2h50m (need live score updates)
      //   - AWAITING_RESULT: now is past start+2h50m (likely finished, need final score)
      // Skip matches that haven't started yet (now < start_time) and
      // matches that are already FINAL/POSTPONED/CANCELLED (filtered by SQL).
      if (matchStart < now) {
        needingResults.push({
          matchId: row.matchId as string,
          homeTeam: row.homeTeam as string,
          awayTeam: row.awayTeam as string,
          date: dateStr,
          time: timeStr,
        });
      }
    }

    matchesNeedingResults = needingResults.length;
    sampleMatchIds = needingResults.slice(0, 5).map((m) => m.matchId);
    console.log(
      `[cron/scrape-results] Found ${matchesNeedingResults} matches needing results. ` +
      `Sample: ${sampleMatchIds.join(", ")}`,
    );
  } catch (dbErr) {
    console.error("[cron/scrape-results] DB query failed:", dbErr);
    return NextResponse.json(
      { error: "DB query failed", details: dbErr instanceof Error ? dbErr.message : String(dbErr) },
      { status: 500 },
    );
  }

  // ── If no matches need results, exit early ─────────────────────────────
  if (matchesNeedingResults === 0) {
    return NextResponse.json({
      status: "ok",
      message: "No matches need results scraping right now.",
      matchesNeedingResults: 0,
      triggered: false,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Trigger the scraper ────────────────────────────────────────────────
  // Use today's date as the hint — the scraper falls back to /api/predictions/exists
  // if no local matches file exists, so it'll scrape ALL matches in the DB.
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}.${today.getFullYear()}`;

  const scraperUrl = await getScraperUrl();
  if (!scraperUrl) {
    console.error("[cron/scrape-results] Scraper URL not configured");
    return NextResponse.json(
      { error: "Scraper URL not configured" },
      { status: 500 },
    );
  }

  try {
    const scrapeRes = await fetch(`${scraperUrl}/api/scrape/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateStr }),
      signal: AbortSignal.timeout(15000),
    });

    if (!scrapeRes.ok) {
      const text = await scrapeRes.text().catch(() => "");
      console.error(`[cron/scrape-results] Scraper returned ${scrapeRes.status}: ${text}`);
      return NextResponse.json(
        {
          status: "error",
          message: `Scraper returned ${scrapeRes.status}`,
          details: text.slice(0, 200),
          matchesNeedingResults,
          triggered: false,
        },
        { status: 502 },
      );
    }

    const data = await scrapeRes.json();
    console.log(`[cron/scrape-results] Scraper triggered: ${data.scrape_id || data.run_id || "unknown"}`);

    return NextResponse.json({
      status: "ok",
      message: `Triggered scraper for ${dateStr} — ${matchesNeedingResults} match(es) need results.`,
      matchesNeedingResults,
      sampleMatchIds,
      triggered: true,
      scrapeId: data.scrape_id || data.run_id,
      date: dateStr,
      timestamp: new Date().toISOString(),
    });
  } catch (fetchErr) {
    console.error("[cron/scrape-results] Could not reach scraper:", fetchErr);
    return NextResponse.json(
      {
        status: "offline",
        message: `Could not reach scraper at ${scraperUrl}`,
        matchesNeedingResults,
        triggered: false,
      },
      { status: 502 },
    );
  }
}
