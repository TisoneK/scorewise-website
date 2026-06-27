import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScraperUrl } from "@/lib/service-config";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * GET /api/admin/scraper/matches
 *
 * Fetches the list of scraped match files from the scraper, then returns
 * all matches from the most recent file. Admins can see every scraped
 * match (complete + incomplete) — not just the ones that made it to the
 * engine as predictions.
 *
 * Returns:
 *   { files: [{filename, size_bytes, modified}], matches: [...], total: N }
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scraperUrl = await getScraperUrl();
    const scraperKeyRow = await db.serviceConfig.findUnique({
      where: { service_key: { service: "scraper", key: "api_key" } },
    });
    const scraperApiKey = scraperKeyRow?.value || process.env.SCRAPER_API_KEY || "";

    // 1. List output files
    const listRes = await fetch(`${scraperUrl}/api/outputs`, {
      headers: scraperApiKey ? { "X-API-Key": scraperApiKey } : {},
      signal: AbortSignal.timeout(8000),
    });

    if (!listRes.ok) {
      return NextResponse.json(
        { error: `Scraper returned ${listRes.status}` },
        { status: 502 },
      );
    }

    const listData = await listRes.json();
    const matchFiles = listData.match_files || [];

    if (matchFiles.length === 0) {
      return NextResponse.json({
        files: [],
        matches: [],
        total: 0,
        message: "No scraped match files yet",
      });
    }

    // 2. Fetch the most recent match file
    const latestFile = matchFiles[0]; // already sorted by modified desc
    const fileRes = await fetch(`${scraperUrl}/api/outputs/${latestFile.filename}`, {
      headers: scraperApiKey ? { "X-API-Key": scraperApiKey } : {},
      signal: AbortSignal.timeout(8000),
    });

    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch ${latestFile.filename}: ${fileRes.status}` },
        { status: 502 },
      );
    }

    const fileData = await fileRes.json();
    const matches = fileData.matches || [];

    return NextResponse.json({
      files: matchFiles,
      current_file: latestFile.filename,
      matches,
      total: matches.length,
      complete: matches.filter((m: { status?: string }) => m.status === "complete").length,
      incomplete: matches.filter((m: { status?: string }) => m.status !== "complete").length,
    });
  } catch (error) {
    console.error("[admin/scraper/matches] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scraped matches" },
      { status: 500 },
    );
  }
}
