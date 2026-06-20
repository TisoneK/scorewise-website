import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScraperUrl } from "@/lib/service-config";

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/admin/predictions/scrape-single
 *
 * Triggers the scraper to fetch the result for a SINGLE match from Flashscore.
 * The scraper opens one match page, extracts the score + status, and pushes
 * the result back to the website via /api/webhook/result.
 *
 * Takes ~5-10 seconds (one page load + extract + push).
 *
 * Body: { matchId: "GzcUBljD" }
 * Returns: { status, matchId, result, message }
 *
 * Admin + Operator only.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Admin or operator access required" }, { status: 401 });
    }

    const body = await request.json();
    const { matchId } = body;

    if (!matchId || typeof matchId !== "string") {
      return NextResponse.json({ error: "matchId is required" }, { status: 400 });
    }

    const scraperUrl = await getScraperUrl();
    if (!scraperUrl) {
      return NextResponse.json({ error: "Scraper URL not configured" }, { status: 500 });
    }

    const res = await fetch(`${scraperUrl}/api/scrape/results/single`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId }),
      signal: AbortSignal.timeout(25000), // 25s — scraper takes ~5-10s
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { status: "error", message: data.message || data.detail || `Scraper returned ${res.status}` },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[scrape-single] Error:", error);
    return NextResponse.json(
      { error: "Failed to scrape: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
