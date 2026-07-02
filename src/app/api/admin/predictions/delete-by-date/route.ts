import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClient } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/predictions/delete-by-date
 *
 * Deletes all predictions for a specific date using raw SQL.
 * Tries multiple date format matches since the DB may store dates
 * in different formats (YYYY-MM-DD, DD.MM.YYYY, etc.)
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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date must be in YYYY-MM-DD format" }, { status: 400 });
    }

    // Also build DD.MM.YYYY format ( scraper uses this for filenames)
    const [year, month, day] = date.split("-");
    const dotFormat = `${day}.${month}.${year}`;

    const client = getClient();

    // First, sample what date formats exist in the DB
    const sampleResult = await client.execute("SELECT DISTINCT date FROM Prediction LIMIT 20");
    const sampleDates = sampleResult.rows.map((r: any) => r.date);

    // Try exact match first
    let countResult = await client.execute(
      "SELECT COUNT(*) as count FROM Prediction WHERE date = ?",
      [date]
    );
    let count = Number((countResult.rows[0] as any).count);

    // If 0, try DD.MM.YYYY format
    if (count === 0) {
      countResult = await client.execute(
        "SELECT COUNT(*) as count FROM Prediction WHERE date = ?",
        [dotFormat]
      );
      count = Number((countResult.rows[0] as any).count);
    }

    // If still 0, try LIKE match (date contains the YYYY-MM-DD string)
    if (count === 0) {
      countResult = await client.execute(
        "SELECT COUNT(*) as count FROM Prediction WHERE date LIKE ?",
        [`%${date}%`]
      );
      count = Number((countResult.rows[0] as any).count);
    }

    // If still 0, try LIKE with dot format
    if (count === 0) {
      countResult = await client.execute(
        "SELECT COUNT(*) as count FROM Prediction WHERE date LIKE ?",
        [`%${dotFormat}%`]
      );
      count = Number((countResult.rows[0] as any).count);
    }

    if (count === 0) {
      return NextResponse.json({
        ok: true,
        deleted: 0,
        date,
        message: `No predictions found for ${date}. Sample dates in DB: ${sampleDates.slice(0, 5).join(", ")}`,
        sampleDates: sampleDates.slice(0, 10),
      });
    }

    // Delete using whichever format matched
    // Try exact, then dot format, then LIKE patterns
    let deleted = 0;
    await client.execute("DELETE FROM Prediction WHERE date = ?", [date]);
    deleted += count; // We already counted these

    // Also try dot format delete (in case some use that format)
    await client.execute("DELETE FROM Prediction WHERE date = ?", [dotFormat]);

    // Also try LIKE deletes for any remaining
    await client.execute("DELETE FROM Prediction WHERE date LIKE ?", [`%${date}%`]);
    await client.execute("DELETE FROM Prediction WHERE date LIKE ?", [`%${dotFormat}%`]);

    // Log
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
            JSON.stringify({ date, deleted: count, dotFormat }),
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
      dotFormat,
    });
  } catch (error) {
    console.error("[delete-by-date] POST error:", error);
    return NextResponse.json(
      { error: "Failed to delete predictions: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
