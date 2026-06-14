import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEngineUrl, getEngineApiKey } from "@/lib/service-config";
import { db } from "@/lib/db-libsql";

// GET /api/admin/engine — Get engine status (all predictions, not just successful)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ENGINE_URL = await getEngineUrl();
    const API_KEY = await getEngineApiKey();

    if (!API_KEY) {
      return NextResponse.json({ error: "API key not configured. Go to Configuration tab to set it." }, { status: 500 });
    }

    // Fetch all predictions (not just successful) for admin view
    const res = await fetch(`${ENGINE_URL}/api/predictions`, {
      headers: { "X-API-Key": API_KEY },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json(
        { error: `Engine returned ${res.status}`, detail: errorBody },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[admin/engine] Error:", error);
    return NextResponse.json({ error: "Failed to fetch engine data" }, { status: 500 });
  }
}

// DELETE /api/admin/engine — Clear all predictions
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ENGINE_URL = await getEngineUrl();
    const API_KEY = await getEngineApiKey();

    if (!API_KEY) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    // Log the action
    await db.activityLog.create({
      data: {
        userId: (session.user as { id: string }).id,
        action: "SERVICE_TRIGGER",
        service: "engine",
        details: JSON.stringify({ operation: "clear_predictions" }),
      },
    });

    // The engine doesn't have a DELETE endpoint, so we return method info
    return NextResponse.json({
      message: "Use the engine's /api/predictions/download endpoint to export data before clearing. Clear predictions by re-ingesting empty data.",
      engineUrl: ENGINE_URL,
    });
  } catch (error) {
    console.error("[admin/engine] Error:", error);
    return NextResponse.json({ error: "Failed to clear engine data" }, { status: 500 });
  }
}
