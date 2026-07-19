import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";
import { ensureSystemUser } from "@/lib/system-user";

export const dynamic = "force-dynamic";

/**
 * POST /api/client-crash — crash telemetry from the error boundaries.
 *
 * When a page crashes, the boundary reports the error here and it lands in
 * the activity log as CLIENT_CRASH — so "the site died" comes with the
 * exact message, stack, and URL instead of requiring users to describe it
 * (2026-07-18 incident: repeated crashes on the Results tab, no error text
 * available anywhere).
 *
 * Auth: middleware requires a session for /api/* — crashes are only
 * reportable by logged-in users, which is fine (the app is login-gated).
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json().catch(() => ({}));
    const userId =
      (session?.user as { id?: string })?.id || (await ensureSystemUser());
    if (!userId) return NextResponse.json({ ok: false }, { status: 500 });

    await db.activityLog.create({
      data: {
        userId,
        action: "CLIENT_CRASH",
        service: "website",
        details: JSON.stringify({
          message: String(body.message || "").slice(0, 500),
          digest: String(body.digest || "").slice(0, 100),
          stack: String(body.stack || "").slice(0, 2000),
          url: String(body.url || "").slice(0, 300),
          userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
          at: new Date().toISOString(),
        }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[client-crash] failed to record:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
