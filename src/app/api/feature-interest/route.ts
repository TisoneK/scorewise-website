import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";

export const dynamic = "force-dynamic";

/**
 * POST /api/feature-interest { feature } — a user opts in to be notified when
 * a "coming soon" feature launches. Recorded in the activity log so admins can
 * see which features have demand (action=FEATURE_INTEREST).
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { feature } = await request.json().catch(() => ({}));
    if (!feature || typeof feature !== "string") {
      return NextResponse.json({ error: "feature is required" }, { status: 400 });
    }
    await db.activityLog.create({
      data: {
        userId,
        action: "FEATURE_INTEREST",
        service: "website",
        details: JSON.stringify({ feature: feature.slice(0, 60), at: new Date().toISOString() }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[feature-interest] error:", e);
    return NextResponse.json({ error: "Could not record" }, { status: 500 });
  }
}
