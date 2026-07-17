import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEngineUrl, getEngineApiKey } from "@/lib/service-config";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/engine/config — proxy the engine's effective runtime config
 * (secrets masked by the engine itself) to the admin dashboard.
 *
 * Admins need eyes on what the engine is ACTUALLY running with — e.g. the
 * 2026-07-17 outage came down to the engine's effective WEBSITE_WEBHOOK_URL,
 * which was invisible from the website until this route existed.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Admin or operator access required" }, { status: 401 });
    }

    const engineUrl = await getEngineUrl();
    const apiKey = await getEngineApiKey();
    if (!engineUrl || !apiKey) {
      return NextResponse.json({ error: "Engine URL or API key not configured" }, { status: 500 });
    }

    const res = await fetch(`${engineUrl.replace(/\/$/, "")}/api/config`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Engine returned HTTP ${res.status}`, body: text.slice(0, 300) },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[admin/engine/config] Error:", error);
    return NextResponse.json(
      { error: "Failed: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
