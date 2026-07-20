import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";
import { getScraperUrl } from "@/lib/service-config";

export const dynamic = "force-dynamic";

async function getScraperApiKey(): Promise<string> {
  const row = await db.serviceConfig.findUnique({
    where: { service_key: { service: "scraper", key: "api_key" } },
  });
  return row?.value || process.env.SCRAPER_API_KEY || "";
}

async function requireAdminOrOperator() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  if (!session || (role !== "ADMIN" && role !== "OPERATOR")) return null;
  return session;
}

/**
 * GET /api/admin/scraper/schedule — proxy the scraper's autonomous-scheduler
 * state (results scheduler + scheduled-matches scheduler) to the admin UI.
 */
export async function GET() {
  if (!(await requireAdminOrOperator())) {
    return NextResponse.json({ error: "Admin or operator access required" }, { status: 401 });
  }
  try {
    const base = await getScraperUrl();
    const apiKey = await getScraperApiKey();
    const headers: Record<string, string> = {};
    if (apiKey) headers["X-API-Key"] = apiKey;
    const res = await fetch(`${base.replace(/\/$/, "")}/api/schedule`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Scraper returned HTTP ${res.status}` }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Could not reach scraper: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }
}

/**
 * PUT /api/admin/scraper/schedule — configure both schedulers. Body mirrors
 * the scraper's ScheduleConfigRequest (results_enabled, *_interval_seconds,
 * scheduled_enabled, scheduled_interval_hours, scheduled_day). Admin only.
 */
export async function PUT(request: Request) {
  const session = await requireAdminOrOperator();
  if (!session) {
    return NextResponse.json({ error: "Admin or operator access required" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const base = await getScraperUrl();
    const apiKey = await getScraperApiKey();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;
    const res = await fetch(`${base.replace(/\/$/, "")}/api/schedule`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: `Scraper returned HTTP ${res.status}`, data }, { status: 502 });
    }
    // Audit the scheduler change.
    try {
      const userId = (session.user as { id?: string })?.id;
      if (userId) {
        await db.activityLog.create({
          data: {
            userId,
            action: "SCHEDULER_CONFIG",
            service: "scraper",
            details: JSON.stringify(body),
          },
        });
      }
    } catch {}
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Could not reach scraper: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }
}
