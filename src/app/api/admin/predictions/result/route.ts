import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/predictions/result
 *
 * Sets the result (final score + status) for a prediction. Admin + Operator only.
 *
 * Used by:
 *   - Operators/admins filling in scores manually via the Results tab
 *   - Future: the scraper auto-fetching final scores (resultSource = "scraper")
 *
 * Body: {
 *   matchId: string,           // required
 *   homeScore: number | null,  // null = clear score (e.g. for PENDING/POSTPONED)
 *   awayScore: number | null,
 *   resultStatus: "PENDING" | "LIVE" | "FINAL" | "POSTPONED" | "CANCELLED",
 *   resultSource?: "manual" | "scraper"  // defaults to "manual"
 * }
 *
 * Returns: { ok: true, matchId, ...resultFields }
 */
const VALID_STATUSES = ["PENDING", "LIVE", "FINAL", "POSTPONED", "CANCELLED"];

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Admin or operator access required" }, { status: 401 });
    }

    const body = await request.json();
    const { matchId, homeScore, awayScore, resultStatus, resultSource } = body;

    if (!matchId || typeof matchId !== "string") {
      return NextResponse.json({ error: "matchId is required" }, { status: 400 });
    }
    if (!resultStatus || !VALID_STATUSES.includes(resultStatus)) {
      return NextResponse.json(
        { error: `resultStatus must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    // Validate scores: must be null OR non-negative integers
    const validateScore = (s: unknown, name: string): number | null => {
      if (s === null || s === undefined || s === "") return null;
      const n = typeof s === "string" ? parseInt(s, 10) : Number(s);
      if (!Number.isInteger(n) || n < 0) {
        throw new Error(`${name} must be a non-negative integer (got ${JSON.stringify(s)})`);
      }
      return n;
    };

    let validHome: number | null;
    let validAway: number | null;
    try {
      validHome = validateScore(homeScore, "homeScore");
      validAway = validateScore(awayScore, "awayScore");
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }

    // PENDING / POSTPONED / CANCELLED — scores should be null
    // LIVE / FINAL — scores can be set (LIVE = partial, FINAL = full)
    if (resultStatus === "PENDING" || resultStatus === "POSTPONED" || resultStatus === "CANCELLED") {
      validHome = null;
      validAway = null;
    } else if (validHome === null || validAway === null) {
      // LIVE/FINAL require both scores
      return NextResponse.json(
        { error: `${resultStatus} requires both homeScore and awayScore` },
        { status: 400 },
      );
    }

    // Verify the prediction exists
    const existing = await db.prediction.findUnique({ where: { matchId } });
    if (!existing) {
      return NextResponse.json({ error: `No prediction found for matchId: ${matchId}` }, { status: 404 });
    }

    // Update the result fields. NOTE: resultUpdatedAt is stored as an ISO string
    // so it round-trips cleanly through SQLite TEXT and our db-libsql wrapper.
    const nowIso = new Date().toISOString();
    await db.prediction.update({
      where: { matchId },
      data: {
        homeScore: validHome,
        awayScore: validAway,
        resultStatus,
        resultSource: resultSource === "scraper" ? "scraper" : "manual",
        resultUpdatedAt: nowIso,
      },
    });

    // Log to ActivityLog
    try {
      const userId = (session.user as { id?: string })?.id;
      if (userId) {
        await db.activityLog.create({
          data: {
            userId,
            action: "RESULT_UPDATE",
            service: "website",
            details: JSON.stringify({
              matchId,
              homeTeam: existing.homeTeam,
              awayTeam: existing.awayTeam,
              homeScore: validHome,
              awayScore: validAway,
              resultStatus,
              resultSource: resultSource === "scraper" ? "scraper" : "manual",
            }),
          },
        });
      }
    } catch (logErr) {
      console.warn("[result] ActivityLog write failed:", logErr);
    }

    return NextResponse.json({
      ok: true,
      matchId,
      homeScore: validHome,
      awayScore: validAway,
      resultStatus,
      resultSource: resultSource === "scraper" ? "scraper" : "manual",
      resultUpdatedAt: nowIso,
    });
  } catch (error) {
    console.error("[result] POST error:", error);
    return NextResponse.json(
      { error: "Failed to update result: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
