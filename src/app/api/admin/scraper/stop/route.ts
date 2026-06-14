import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScraperUrl } from "@/lib/service-config";
import { db } from "@/lib/db";

// POST /api/admin/scraper/stop — Send stop signal to running scraper
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scraperUrl = await getScraperUrl();
    const scraperApiKey = await getScraperApiKey();

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (scraperApiKey) headers["X-API-Key"] = scraperApiKey;

      const res = await fetch(`${scraperUrl}/api/scrape/stop`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(10000),
      });

      const data = await res.json();

      if (!res.ok) {
        return NextResponse.json({
          success: false,
          message: data.detail || `Scraper returned ${res.status}`,
        }, { status: res.status });
      }

      // Log the action
      await db.activityLog.create({
        data: {
          userId: (session.user as { id: string }).id,
          action: "SERVICE_TRIGGER",
          service: "scraper",
          details: JSON.stringify({ operation: "stop_scrape" }),
        },
      });

      return NextResponse.json({
        success: true,
        message: data.message || "Stop signal sent",
      });
    } catch {
      return NextResponse.json({
        success: false,
        message: `Could not reach scraper at ${scraperUrl}`,
      });
    }
  } catch (error) {
    console.error("[admin/scraper/stop] Error:", error);
    return NextResponse.json({ error: "Failed to stop scraper" }, { status: 500 });
  }
}

async function getScraperApiKey(): Promise<string> {
  const row = await db.serviceConfig.findUnique({ where: { service_key: { service: "scraper", key: "api_key" } } });
  return row?.value || process.env.SCRAPER_API_KEY || "";
}
