import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

export const dynamic = 'force-dynamic';

// GET /api/debug — Check environment and test Turso connection
export async function GET() {
  const results: Record<string, any> = {
    env: {
      hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
      hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
      hasDbUrl: !!process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      tursoUrlPrefix: process.env.TURSO_DATABASE_URL?.substring(0, 15) + "...",
    },
  };

  // Test direct Turso connection
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    try {
      const rs = await client.execute("SELECT 1 as test");
      results.directConnection = {
        ok: true,
        rows: rs.rows,
      };
    } catch (e: any) {
      results.directConnection = {
        ok: false,
        error: e.message || String(e),
        code: e.code,
      };
    }

    // Test Prisma adapter
    try {
      const { PrismaClient } = await import("@prisma/client");
      const { PrismaLibSQL } = await import("@prisma/adapter-libsql");

      const adapter = new PrismaLibSQL({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
      const prisma = new PrismaClient({ adapter });

      const userCount = await prisma.user.count();
      results.prismaConnection = {
        ok: true,
        userCount,
      };

      await prisma.$disconnect();
    } catch (e: any) {
      results.prismaConnection = {
        ok: false,
        error: e.message || String(e),
        code: e.code,
      };
    }
  }

  return NextResponse.json(results);
}
