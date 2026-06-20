import { NextResponse } from "next/server";
import { db } from "@/lib/db-libsql";
import { getScraperUrl } from "@/lib/service-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/scrape-tomorrow
 *
 * Vercel cron job — triggers the scraper to collect tomorrow's match data
 * (odds, H2H, team info) from Flashscore. The scraper pushes the data to
 * the engine, which runs predictions and pushes them to the website via
 * webhook.
 *
 * Auth: same as /api/cron/scrape-results — CRON_SECRET via header or query param.
 *
 * Checks the ServiceConfig DB for auto_scrape_tomorrow=true before triggering.
 * If disabled, returns 200 with "disabled" status (no error — just skipped).
 */
export async function GET(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  let cronSecret = process.env.CRON_SECRET || "";
  if (!cronSecret) {
    try {
      const row = await db.serviceConfig.findUnique({
        where: { service_key: { service: "website", key: "cron_secret" } },
      });
      cronSecret = row?.value || "";
    } catch {}
  }

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret") || "";
  const providedSecret = authHeader.replace(/^Bearer\s+/i, "") || querySecret;

  if (providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Check if auto-scrape is enabled ─────────────────────────────────────
  let autoEnabled = false;
  let scrapeTime = "06:00";
  try {
    const enabledRow = await db.serviceConfig.findUnique({
      where: { service_key: { service: "scraper", key: "auto_scrape_tomorrow" } },
    });
    autoEnabled = enabledRow?.value === "true";

    const timeRow = await db.serviceConfig.findUnique({
      where: { service_key: { service: "scraper", key: "auto_scrape_tomorrow_time" } },
    });
    scrapeTime = timeRow?.value || "06:00";
  } catch {}

  if (!autoEnabled) {
    return NextResponse.json({
      status: "ok",
      message: "Auto-scrape tomorrow is disabled. Enable it in the Config tab.",
      enabled: false,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Check if it's the right time ────────────────────────────────────────
  // The cron should run at the configured time. We check if current time
  // is within 30 minutes of the configured time (to handle cron delays).
  const now = new Date();
  const [targetHour, targetMin] = scrapeTime.split(":").map(Number);
  const targetTotalMin = targetHour * 60 + targetMin;
  const nowTotalMin = now.getHours() * 60 + now.getMinutes();
  const diff = Math.abs(nowTotalMin - targetTotalMin);
  if (diff > 30 && diff < 1410) { // 1410 = 24*60 - 30 (wrap-around check)
    return NextResponse.json({
      status: "ok",
      message: `Not time yet — scheduled for ${scrapeTime}, current time is ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
      enabled: true,
      triggered: false,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Trigger the scraper ────────────────────────────────────────────────
  const scraperUrl = await getScraperUrl();
  if (!scraperUrl) {
    return NextResponse.json({ error: "Scraper URL not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${scraperUrl}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: "Tomorrow" }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { status: "error", message: data.detail || data.message || `Scraper returned ${res.status}` },
        { status: 502 },
      );
    }

    // Log the action
    try {
      const systemUserId = (
        await db.serviceConfig.findUnique({
          where: { service_key: { service: "website", key: "system_user_id" } },
        })
      )?.value;
      if (systemUserId) {
        await db.activityLog.create({
          data: {
            userId: systemUserId,
            action: "CRON_SCRAPE_TOMORROW",
            service: "scraper",
            details: JSON.stringify({
              scrape_id: data.scrape_id || data.run_id,
              triggered_at: new Date().toISOString(),
            }),
          },
        });
      }
    } catch {}

    return NextResponse.json({
      status: "ok",
      message: `Triggered tomorrow scrape — ${data.message || "started"}`,
      enabled: true,
      triggered: true,
      scrapeId: data.scrape_id || data.run_id,
      timestamp: new Date().toISOString(),
    });
  } catch (fetchErr) {
    return NextResponse.json(
      { status: "offline", message: `Could not reach scraper at ${scraperUrl}` },
      { status: 502 },
    );
  }
}
