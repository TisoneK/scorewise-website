import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createClient } from "@libsql/client";

export const dynamic = 'force-dynamic';

/**
 * TEMPORARY one-time migration endpoint.
 * Adds result-tracking columns to the Prediction table:
 *   homeScore, awayScore, resultStatus, resultSource, resultUpdatedAt
 *
 * DELETE this file after first invocation.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 401 });
  }
  const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const columns = [
    "homeScore INTEGER",
    "awayScore INTEGER",
    "resultStatus TEXT",
    "resultSource TEXT",
    "resultUpdatedAt DATETIME",
  ];
  const results: string[] = [];
  for (const col of columns) {
    const colName = col.split(" ")[0];
    try {
      await turso.execute(`ALTER TABLE Prediction ADD COLUMN ${col}`);
      results.push(`+ ${colName}`);
    } catch (e: any) {
      if (String(e).includes("duplicate column")) {
        results.push(`✓ ${colName} (already exists)`);
      } else {
        results.push(`✗ ${colName}: ${e.message}`);
      }
    }
  }
  return NextResponse.json({ ok: true, results });
}
