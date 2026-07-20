import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, getClient } from "@/lib/db-libsql";

export const dynamic = "force-dynamic";

// Extended profile columns aren't in the original User table. Add them once
// per serverless instance (idempotent — ALTER throws "duplicate column" if
// they already exist, which we ignore). Mirrors the Prediction reduced-risk
// column migration pattern.
let ensured = false;
async function ensureProfileColumns() {
  if (ensured) return;
  const client = getClient();
  for (const col of ["phone", "country", "city"]) {
    try { await client.execute(`ALTER TABLE User ADD COLUMN ${col} TEXT`); } catch { /* already exists */ }
  }
  ensured = true;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    await ensureProfileColumns();
    const u = await db.user.findUnique({ where: { id: userId } });
    if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const createdAt = typeof u.createdAt === "string" ? u.createdAt : new Date(u.createdAt).toISOString();
    return NextResponse.json({
      id: u.id, email: u.email, role: u.role,
      name: u.name ?? "", phone: u.phone ?? "", country: u.country ?? "", city: u.city ?? "",
      createdAt,
      // Google accounts have an unknowable placeholder hash — they can't set a password.
      passwordManaged: !u.passwordHash,
    });
  } catch (e) {
    console.error("[user/profile] GET error:", e);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    await ensureProfileColumns();

    const body = await request.json().catch(() => ({}));
    const data: Record<string, string | null> = {};
    for (const f of ["name", "phone", "country", "city"] as const) {
      if (typeof body[f] === "string") {
        const v = body[f].trim();
        if (f === "name" && v.length === 0) continue; // name can't be blanked
        data[f] = v || null;
      }
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    await db.user.update({ where: { id: userId }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[user/profile] PATCH error:", e);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}
