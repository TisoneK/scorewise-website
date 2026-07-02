import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClient } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/predictions/delete-by-date
 *
 * Deletes all predictions for a specific date using raw SQL.
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

    // Use raw SQL directly — the db-libsql wrapper's prediction.delete
    // only supports deleting by matchId/id, not by date.
    const client = getClient();

    // First count how many will be deleted
    const countResult = await client.execute(
      "SELECT COUNT(*) as count FROM Prediction WHERE date = ?",
      [date]
    );
    const count = Number((countResult.rows[0] as any).count);

    if (count === 0) {
      return NextResponse.json({
        ok: true,
        deleted: 0,
        date,
        message: `No predictions found for ${date}`,
      });
    }

    // Delete all predictions for this date
    await client.execute(
      "DELETE FROM Prediction WHERE date = ?",
      [date]
    );

    // Log to activity log using raw SQL (bypass wrapper)
    try {
      const userId = (session.user as { id?: string })?.id;
      if (userId) {
        await client.execute(
          "INSERT INTO ActivityLog (id, userId, action, service, details, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
          [
            crypto.randomUUID(),
            userId,
            "PREDICTIONS_DELETE",
            "website",
            JSON.stringify({ date, deleted: count }),
            new Date().toISOString(),
          ]
        );
      }
    } catch (logErr) {
      console.warn("[delete-by-date] ActivityLog write failed:", logErr);
    }

    return NextResponse.json({
      ok: true,
      deleted: count,
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
