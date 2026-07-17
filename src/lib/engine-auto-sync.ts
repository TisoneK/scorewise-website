import { db } from "@/lib/db-libsql";
import { getConfig, getEngineUrl, getEngineApiKey } from "@/lib/service-config";
import { upsertEnginePredictions } from "@/lib/prediction-upsert";
import { ensureSystemUser } from "@/lib/system-user";

/**
 * Traffic-driven auto-sync: pull the engine's store into the website DB
 * whenever they drift — no cron, no button, no admin attention needed.
 *
 * The primary delivery path is the engine's push webhook. But that channel
 * can die silently (2026-07-17: the engine's WEBSITE_WEBHOOK_URL config was
 * lost — 22 ingested predictions, 0 delivered, nothing anywhere said so).
 * This function runs AFTER responses on the regularly-polled prediction
 * endpoints (via next/server `after()`), so any dashboard being open heals
 * the pipeline within minutes.
 *
 * Cheap by design:
 *  - per-instance + durable debounce (at most one engine check per
 *    MIN_INTERVAL_MS across all serverless instances)
 *  - the engine store's (updated_at, ingestion_count) signature is compared
 *    to the last synced signature — no signature change, no writes
 *  - upserts go through the same shared logic as the webhook, so manual
 *    reduced-risk overrides are never clobbered; rows are never deleted
 */

const MARKER_KEY = "engine_auto_sync_marker"; // ServiceConfig service="website"
const MIN_INTERVAL_MS = 5 * 60 * 1000;

let lastCheckAt = 0; // per-instance first gate (avoids DB reads on every poll)

interface Marker {
  sig?: string;
  checkedAt?: number;
}

async function saveMarker(m: Marker): Promise<void> {
  await db.serviceConfig.upsert({
    where: { service_key: { service: "website", key: MARKER_KEY } },
    update: { value: JSON.stringify(m), secret: false },
    create: { service: "website", key: MARKER_KEY, value: JSON.stringify(m), secret: false },
  });
}

export async function runEngineAutoSync(): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastCheckAt < MIN_INTERVAL_MS) return;
    lastCheckAt = now;

    let marker: Marker = {};
    try {
      marker = JSON.parse((await getConfig("website", MARKER_KEY)) || "{}") as Marker;
    } catch {}
    if (marker.checkedAt && now - marker.checkedAt < MIN_INTERVAL_MS) return;

    const engineUrl = await getEngineUrl();
    const apiKey = await getEngineApiKey();
    if (!engineUrl || !apiKey) return;

    const res = await fetch(`${engineUrl.replace(/\/$/, "")}/api/predictions?successful_only=false`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      // 404 = empty store on older engine builds; anything else = engine
      // unreachable. Either way there is nothing to pull — just note the check.
      await saveMarker({ sig: marker.sig, checkedAt: now });
      return;
    }

    const data = await res.json();
    const sig = `${data.updated_at ?? ""}|${data.ingestion_count ?? ""}`;
    if (sig === marker.sig) {
      await saveMarker({ sig, checkedAt: now });
      return;
    }

    const preds = Array.isArray(data.predictions) ? data.predictions : [];
    const counts = await upsertEnginePredictions(preds, data.source || "engine-auto-sync", "engine-auto-sync");
    await saveMarker({ sig, checkedAt: now });

    console.log(
      `[engine-auto-sync] Drift detected (engine sig ${sig}) — pulled ${preds.length}: ` +
      `${counts.stored} new, ${counts.updated} updated, ${counts.errors} errors`,
    );

    if (counts.stored > 0 || counts.updated > 0) {
      try {
        const systemUserId = await ensureSystemUser();
        if (systemUserId) {
          await db.activityLog.create({
            data: {
              userId: systemUserId,
              action: "ENGINE_AUTO_SYNC",
              service: "engine",
              details: JSON.stringify({ fetched: preds.length, ...counts, engine_sig: sig }),
            },
          });
        }
      } catch {}
    }
  } catch (e) {
    // Never let background self-heal break a foreground request.
    console.warn("[engine-auto-sync] check failed:", e);
  }
}
