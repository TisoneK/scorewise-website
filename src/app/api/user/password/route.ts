import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

/**
 * POST /api/user/password — the signed-in user changes their own password.
 *
 * Verifies the current password before setting the new one. Google-only
 * accounts have an unknowable random placeholder hash, so bcrypt.compare
 * fails for them with a clear message (they manage sign-in via Google).
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { currentPassword, newPassword } = await request.json().catch(() => ({}));
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Enter your current and new password." }, { status: 400 });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "This account signs in with Google — manage it there." }, { status: 400 });
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

    try {
      await db.activityLog.create({
        data: { userId, action: "USER_PASSWORD_CHANGE", service: "website", details: JSON.stringify({ at: new Date().toISOString() }) },
      });
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[user/password] error:", e);
    return NextResponse.json({ error: "Could not change password." }, { status: 500 });
  }
}
