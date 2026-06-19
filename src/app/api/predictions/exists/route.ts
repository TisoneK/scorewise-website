import { NextResponse } from "next/server";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * GET /api/predictions/exists
 *
 * Returns the set of match_ids that already have predictions in the DB.
 * Used by the scraper to skip matches that have already been scraped +
 * predicted — avoids redundant scraping.
 *
 * No auth required — this endpoint only returns match_id strings, no
 * prediction data. The scraper calls this before starting a scrape.
 *
 * Returns: { match_ids: ["abc123", "def456", ...], count: N }
 */
export async function GET() {
  try {
    const rows = await db.prediction.findMany({
      select: { matchId: true },
    });
    const match_ids = rows.map(r => r.matchId);
    return NextResponse.json({
      match_ids,
      count: match_ids.length,
    });
  } catch (error) {
    console.error('[predictions/exists] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch existing match IDs' },
      { status: 500 },
    );
  }
}
