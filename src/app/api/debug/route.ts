import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const debug: Record<string, any> = {};

  // Check env vars (mask secrets)
  debug.env = {
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL
      ? `${process.env.TURSO_DATABASE_URL.substring(0, 30)}...`
      : "MISSING",
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN
      ? `present (${process.env.TURSO_AUTH_TOKEN.length} chars)`
      : "MISSING",
    DATABASE_URL: process.env.DATABASE_URL
      ? `${process.env.DATABASE_URL.substring(0, 30)}...`
      : "MISSING",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET
      ? `present (${process.env.NEXTAUTH_SECRET.length} chars)`
      : "MISSING",
    SCOREWISE_API_KEY: process.env.SCOREWISE_API_KEY
      ? `present (${process.env.SCOREWISE_API_KEY.length} chars)`
      : "MISSING",
  };

  // Test direct libsql connection
  try {
    const { createClient } = await import("@libsql/client");
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    debug.directLibsql = { ok: true, tables: tables.rows.map((r: any) => r.name) };

    const users = await client.execute("SELECT id, email, role FROM User");
    debug.users = users.rows;
  } catch (err: any) {
    debug.directLibsql = { ok: false, error: err.message };
  }

  // Test Prisma
  try {
    const { db } = await import("@/lib/db-libsql");
    const count = await db.user.count();
    debug.prisma = { ok: true, userCount: count };
  } catch (err: any) {
    debug.prisma = { ok: false, error: err.message, stack: err.stack?.substring(0, 300) };
  }

  return NextResponse.json(debug, { status: debug.prisma?.ok ? 200 : 500 });
}
