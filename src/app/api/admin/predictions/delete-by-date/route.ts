import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClient } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/predictions/delete-by-date
 *
 * Deletes predictions by date or date range.
 *
 * Body options:
 *   { date: "2026-07-03" }                           — delete single date
 *   { fromDate: "2026-06-01", toDate: "2026-06-30" } — delete range (inclusive)
 *
 * Tries multiple date format matches (YYYY-MM-DD, DD.MM.YYYY, LIKE patterns).
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
    const { date, fromDate, toDate } = body;

    // Validate: either single date or range
    const isSingle = date && typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
    const isRange = fromDate && toDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(toDate);

    if (!isSingle && !isRange) {
      return NextResponse.json({
        error: "Provide either { date: 'YYYY-MM-DD' } or { fromDate: 'YYYY-MM-DD', toDate: 'YYYY-MM-DD' }"
      }, { status: 400 });
    }

    const client = getClient();

    // Build date variants for matching
    const makeVariants = (d: string) => {
      const [y, m, day] = d.split("-");
      return [d, `${day}.${m}.${y}`, `%${d}%`, `%${day}.${m}.${y}%`];
    };

    let count = 0;
    let label = "";

    if (isSingle) {
      label = date;
      const variants = makeVariants(date);
      // Count matches
      for (const v of variants) {
        const isLike = v.includes("%");
        const r = await client.execute(
          isLike ? "SELECT COUNT(*) as c FROM Prediction WHERE date LIKE ?" : "SELECT COUNT(*) as c FROM Prediction WHERE date = ?",
          [v]
        );
        count += Number((r.rows[0] as any).c);
      }
      // Avoid double-counting — do a single query with OR
      const countR = await client.execute(
        "SELECT COUNT(*) as c FROM Prediction WHERE date = ? OR date = ? OR date LIKE ? OR date LIKE ?",
        [variants[0], variants[1], `%${date}%`, `%${variants[1]}%`]
      );
      count = Number((countR.rows[0] as any).c);

      if (count === 0) {
        const sample = await client.execute("SELECT DISTINCT date FROM Prediction LIMIT 10");
        return NextResponse.json({
          ok: true, deleted: 0, date,
          message: `No predictions found for ${date}`,
          sampleDates: sample.rows.map((r: any) => r.date),
        });
      }

      // Delete
      await client.execute(
        "DELETE FROM Prediction WHERE date = ? OR date = ? OR date LIKE ? OR date LIKE ?",
        [variants[0], variants[1], `%${date}%`, `%${variants[1]}%`]
      );
    } else {
      label = `${fromDate} to ${toDate}`;
      // For range, we need to handle multiple date formats
      // Get all predictions and filter in JS (safer than SQL date parsing with mixed formats)
      const allPreds = await client.execute("SELECT matchId, date FROM Prediction");
      const toDelete: string[] = [];
      for (const row of allPreds.rows) {
        const p = row as any;
        const d = p.date as string;
        if (!d) continue;
        // Try to parse the date — it might be YYYY-MM-DD or DD.MM.YYYY
        let parsed: Date | null = null;
        if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
          parsed = new Date(d.substring(0, 10));
        } else if (/^\d{2}\.\d{2}\.\d{4}/.test(d)) {
          const parts = d.substring(0, 10).split(".");
          parsed = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        } else {
          // Try Date parse as fallback
          parsed = new Date(d);
        }
        if (parsed && !isNaN(parsed.getTime())) {
          const from = new Date(fromDate);
          const to = new Date(toDate);
          to.setHours(23, 59, 59); // inclusive end
          if (parsed >= from && parsed <= to) {
            toDelete.push(p.matchId);
          }
        }
      }
      count = toDelete.length;

      if (count === 0) {
        const sample = await client.execute("SELECT DISTINCT date FROM Prediction LIMIT 10");
        return NextResponse.json({
          ok: true, deleted: 0, fromDate, toDate,
          message: `No predictions found between ${fromDate} and ${toDate}`,
          sampleDates: sample.rows.map((r: any) => r.date),
        });
      }

      // Delete in batches
      for (let i = 0; i < toDelete.length; i += 50) {
        const batch = toDelete.slice(i, i + 50);
        const placeholders = batch.map(() => "?").join(",");
        await client.execute(`DELETE FROM Prediction WHERE matchId IN (${placeholders})`, batch);
      }
    }

    // Log
    try {
      const userId = (session.user as { id?: string })?.id;
      if (userId) {
        await client.execute(
          "INSERT INTO ActivityLog (id, userId, action, service, details, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
          [crypto.randomUUID(), userId, "PREDICTIONS_DELETE", "website", JSON.stringify({ label, deleted: count }), new Date().toISOString()]
        );
      }
    } catch {}

    return NextResponse.json({ ok: true, deleted: count, label });
  } catch (error) {
    console.error("[delete-by-date] Error:", error);
    return NextResponse.json(
      { error: "Failed: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
