import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/predictions/delete-by-date
 *
 * Deletes all predictions for a specific date.
 *
 * Body: { date: string } — date in YYYY-MM-DD format (e.g., "2026-07-03")
 *
 * Returns: { deleted: number, date: string }
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
    const { date } = body;

    if (!date || typeof date !== "string") {
      return NextResponse.json({ error: "date is required (YYYY-MM-DD format)" }, { status: 400 });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date must be in YYYY-MM-DD format" }, { status: 400 });
    }

    // Fetch all predictions to find ones matching this date
    const allPreds = await db.prediction.findMany({});
    const toDelete = allPreds.filter((p: any) => p.date === date);

    let deleted = 0;
    for (const p of toDelete) {
      try {
        await db.prediction.delete({ where: { matchId: p.matchId } });
        deleted++;
      } catch (err) {
        console.error(`[delete-by-date] Failed to delete ${p.matchId}:`, err);
      }
    }

    // Log to activity log
    try {
      const userId = (session.user as { id?: string })?.id;
      if (userId) {
        await db.activityLog.create({
          data: {
            userId,
            action: "PREDICTIONS_DELETE",
            service: "website",
            details: JSON.stringify({ date, deleted }),
          },
        });
      }
    } catch (logErr) {
      console.warn("[delete-by-date] ActivityLog write failed:", logErr);
    }

    return NextResponse.json({
      ok: true,
      deleted,
      date,
    });
  } catch (error) {
    console.error("[delete-by-date] POST error:", error);
    return NextResponse.json(
      { error: "Failed to delete predictions: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
