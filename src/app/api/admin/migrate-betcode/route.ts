// Temporary migration endpoint - DELETE after use
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createClient } from "@libsql/client";

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 401 });
  }
  const turso = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  try {
    await turso.execute("ALTER TABLE Prediction ADD COLUMN betCode TEXT");
    return NextResponse.json({ ok: true, message: "betCode column added" });
  } catch (e: any) {
    if (String(e).includes("duplicate column")) {
      return NextResponse.json({ ok: true, message: "betCode column already exists" });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
