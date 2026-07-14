import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClient } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/migrate-schema
 *
 * Adds missing columns to the Prediction table at runtime (not build time).
 * This avoids the Vercel build failure caused by prisma db push not being
 * able to connect to Turso during the build.
 *
 * Uses raw SQL ALTER TABLE to add columns IF they don't already exist.
 * SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN, so we
 * check the table schema first and only add columns that are missing.
 *
 * Admin only.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }

    const client = getClient();

    // Get current columns in Prediction table
    const schemaResult = await client.execute("PRAGMA table_info(Prediction)");
    const existingColumns = new Set(schemaResult.rows.map((r: any) => r.name));

    const columnsToAdd = [
      { name: "reducedOverTotal", type: "REAL" },
      { name: "reducedOverOdds", type: "REAL" },
      { name: "reducedUnderTotal", type: "REAL" },
      { name: "reducedUnderOdds", type: "REAL" },
      // Audit trail for the manual reduced-risk override feature.
      // Added 2026-07-14 — see prisma/schema.prisma for full rationale.
      { name: "reducedRiskSource", type: "TEXT" },     // "manual" | "scraper" | null
      { name: "reducedRiskUpdatedAt", type: "DATETIME" },
      { name: "reducedRiskUpdatedBy", type: "TEXT" },  // userId
    ];

    const added: string[] = [];
    const skipped: string[] = [];

    for (const col of columnsToAdd) {
      if (existingColumns.has(col.name)) {
        skipped.push(col.name);
      } else {
        try {
          await client.execute(`ALTER TABLE Prediction ADD COLUMN ${col.name} ${col.type}`);
          added.push(col.name);
        } catch (err) {
          console.error(`[migrate-schema] Failed to add ${col.name}:`, err);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      added,
      skipped,
      message: added.length > 0
        ? `Added ${added.length} column(s): ${added.join(", ")}`
        : "All columns already exist — no changes needed",
    });
  } catch (error) {
    console.error("[migrate-schema] Error:", error);
    return NextResponse.json(
      { error: "Migration failed: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
