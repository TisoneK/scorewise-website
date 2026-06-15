import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScraperUrl } from "@/lib/service-config";
import { db } from "@/lib/db-libsql";

// GET /api/admin/scraper/history — Get scraper run history
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scraperUrl = await getScraperUrl();
    const scraperApiKey = await getScraperApiKey();

    try {
      const headers: Record<string, string> = {};
      if (scraperApiKey) headers["X-API-Key"] = scraperApiKey;

      const res = await fetch(`${scraperUrl}/api/history?limit=20`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: `Scraper returned ${res.status}` },
          { status: res.status }
        );
      }

      const data = await res.json();

      // GitHub scraper returns { runs: [...], total: N }
      // Normalize to { history: [...], total: N } for frontend compatibility
      return NextResponse.json({
        history: data.runs || data.history || [],
        total: data.total || 0,
      });
    } catch {
      return NextResponse.json({
        history: [],
        total: 0,
        message: `Could not reach scraper at ${scraperUrl}. The scraper API server may not be running.`,
      });
    }
  } catch (error) {
    console.error("[admin/scraper/history] Error:", error);
    return NextResponse.json({ error: "Failed to fetch scraper history" }, { status: 500 });
  }
}

async function getScraperApiKey(): Promise<string> {
  const row = await db.serviceConfig.findUnique({ where: { service_key: { service: "scraper", key: "api_key" } } });
  return row?.value || process.env.SCRAPER_API_KEY || "";
}
