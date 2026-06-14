import { NextResponse } from "next/server";
import { getEngineUrl, getEngineApiKey } from "@/lib/service-config";

// GET /api/predictions — Proxy to engine (successful predictions only, for regular users)
export async function GET() {
  try {
    const ENGINE_URL = await getEngineUrl();
    const API_KEY = await getEngineApiKey();

    if (!API_KEY) {
      return NextResponse.json(
        { error: "Service not configured", detail: "API key is missing. Contact an admin to configure the engine API key." },
        { status: 503 }
      );
    }

    const res = await fetch(`${ENGINE_URL}/api/predictions?successful_only=true`, {
      headers: { "X-API-Key": API_KEY },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: "Authentication failed", detail: "The engine API key is invalid. An admin needs to update it in the configuration panel." },
          { status: 502 }
        );
      }
      const errorBody = await res.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: `Engine returned ${res.status}`, detail: errorBody },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[predictions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch predictions", detail: "Could not connect to the prediction engine. Please try again later." },
      { status: 502 }
    );
  }
}
