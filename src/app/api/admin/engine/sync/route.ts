import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";
import { getEngineUrl, getEngineApiKey } from "@/lib/service-config";
import { upsertEnginePredictions, type EnginePrediction } from "@/lib/prediction-upsert";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/engine/sync — pull the engine's prediction store into the
 * website DB (admin/operator only).
 *
 * The normal delivery path is push: the engine webhooks every ingest to
 * /api/webhook/predictions. But that channel can silently die — e.g. an
 * engine redeploy wipes its data/config.json overrides, disabling the
 * webhook sender until config is pushed again (exactly what happened on
 * 2026-07-17: 22 ingested predictions, 0 delivered). This endpoint is the
 * recovery path: it reads GET {engine}/api/predictions directly and upserts
 * through the same shared logic as the webhook, so manual reduced-risk
 * overrides and single-side normalization behave identically.
 *
 * Triggers NO scrape and NO engine ingest — it only copies what the engine
 * already holds.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Admin or operator access required" }, { status: 401 });
    }

    const engineUrl = await getEngineUrl();
    const apiKey = await getEngineApiKey();
    if (!engineUrl) {
      return NextResponse.json({ error: "Engine URL not configured" }, { status: 500 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: "Engine API key not configured" }, { status: 500 });
    }

    const res = await fetch(`${engineUrl}/api/predictions?successful_only=false`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) {
      // Older engine builds 404 on an empty store — nothing to sync.
      return NextResponse.json({ ok: true, fetched: 0, stored: 0, updated: 0, errors: 0, message: "Engine store is empty." });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Engine returned HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const preds: EnginePrediction[] = Array.isArray(data.predictions) ? data.predictions : [];

    const counts = await upsertEnginePredictions(preds, data.source || "engine-sync", "admin/engine/sync");

    try {
      revalidatePath("/api/predictions");
      revalidatePath("/");
    } catch {}

    try {
      const userId = (session.user as { id?: string })?.id;
      if (userId) {
        await db.activityLog.create({
          data: {
            userId,
            action: "ENGINE_SYNC",
            service: "engine",
            details: JSON.stringify({ fetched: preds.length, ...counts }),
          },
        });
      }
    } catch (e) {
      console.warn("[admin/engine/sync] Activity log failed:", e);
    }

    return NextResponse.json({ ok: true, fetched: preds.length, ...counts });
  } catch (error) {
    console.error("[admin/engine/sync] Error:", error);
    return NextResponse.json(
      { error: "Sync failed: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
