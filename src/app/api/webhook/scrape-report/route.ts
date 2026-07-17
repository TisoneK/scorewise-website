import { NextResponse } from "next/server";
import { readAndVerifyWebhookBodyAsync, type WebhookEnvelope } from "@/lib/webhook-verify";
import { ensureSystemUser } from "@/lib/system-user";
import { db } from "@/lib/db-libsql";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhook/scrape-report
 *
 * Receiver for the scraper's "scrape_report" webhook — the per-match record
 * of what a scrape run did, INCLUDING the matches that did not qualify for
 * prediction and why (missing odds fields, insufficient H2H, ...). Only
 * complete matches travel to the engine, so this report is the only place
 * admins can see the full picture of a run.
 *
 * Stored as an ActivityLog entry (action=SCRAPE_REPORT, service=scraper);
 * the admin dashboard reads the latest one via GET /api/admin/logs.
 */

interface ScrapeReportMatch {
  match_id?: string;
  home_team?: string;
  away_team?: string;
  country?: string;
  league?: string;
  date?: string;
  time?: string;
  status?: string;
  skip_reason?: string | null;
}

interface ScrapeReportData {
  scrape_id?: string;
  day?: string;
  total_collected?: number;
  complete_matches?: number;
  incomplete_matches?: number;
  matches?: ScrapeReportMatch[];
}

export async function POST(request: Request) {
  const envelope = await readAndVerifyWebhookBodyAsync<WebhookEnvelope<ScrapeReportData>>(request);
  if (!envelope) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (envelope.event !== "scrape_report") {
    return NextResponse.json({ error: `Unexpected event '${envelope.event}'` }, { status: 400 });
  }

  const data = envelope.data || {};
  const matches = Array.isArray(data.matches) ? data.matches : [];

  try {
    const systemUserId = await ensureSystemUser();
    if (!systemUserId) {
      return NextResponse.json({ error: "Could not resolve system user" }, { status: 500 });
    }
    await db.activityLog.create({
      data: {
        userId: systemUserId,
        action: "SCRAPE_REPORT",
        service: "scraper",
        details: JSON.stringify({
          scrape_id: data.scrape_id ?? null,
          day: data.day ?? null,
          total_collected: data.total_collected ?? matches.length,
          complete_matches: data.complete_matches ?? 0,
          incomplete_matches: data.incomplete_matches ?? 0,
          matches,
          received_at: new Date().toISOString(),
        }),
      },
    });
  } catch (e) {
    console.error("[webhook/scrape-report] Failed to store report:", e);
    return NextResponse.json({ error: "Failed to store report" }, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    matches_received: matches.length,
    incomplete: data.incomplete_matches ?? 0,
  });
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
