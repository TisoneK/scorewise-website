import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";
import { getEngineUrl, getEngineApiKey, getScraperUrl } from "@/lib/service-config";

export const dynamic = 'force-dynamic';

/**
 * Mapping table: website ServiceConfig keys → engine/scraper env-config keys.
 *
 * When the admin clicks "Push" on a config row, the website reads the value
 * from its DB and forwards it to the appropriate service's /api/config (engine)
 * or /api/env-config (scraper) endpoint.
 *
 * The mapping is intentionally explicit — different services may use different
 * key names for the same logical concept (e.g. the engine's
 * WEBSITE_WEBHOOK_SECRET corresponds to the website's own `website/webhook_secret`
 * ServiceConfig entry).
 */
const ENGINE_KEY_MAP: Record<string, string> = {
  // website ServiceConfig key → engine env-config key
  "engine:scraper_url": "SCRAPER_URL",
  "engine:scraper_api_key": "SCRAPER_API_KEY",
  "engine:website_webhook_url": "WEBSITE_WEBHOOK_URL",
  "engine:website_webhook_secret": "WEBSITE_WEBHOOK_SECRET",
  "engine:cors_allowed_origins": "CORS_ALLOWED_ORIGINS",
};

const SCRAPER_KEY_MAP: Record<string, string> = {
  // website ServiceConfig key → scraper env-config key
  "scraper:webhook_url": "SCOREWISE_WEBHOOK_URL",
  "scraper:api_key": "SCOREWISE_API_KEY",
  "scraper:cron_schedule": "SCRAPER_CRON_SCHEDULE",
  "scraper:log_level": "SCRAPER_LOG_LEVEL",
};

interface PushRequest {
  service: "engine" | "scraper";
  keys: string[]; // website ServiceConfig keys to push (e.g. ["scraper:webhook_url"])
}

interface PushResult {
  service: string;
  pushed: string[];
  failed: { key: string; error: string }[];
  unreachable?: boolean;
  message?: string;
}

async function pushToEngine(keys: string[]): Promise<PushResult> {
  const engineUrl = await getEngineUrl();
  const apiKey = await getEngineApiKey();
  const result: PushResult = { service: "engine", pushed: [], failed: [] };

  if (!apiKey) {
    result.message = "Engine API key not configured on the website — cannot authenticate to engine.";
    return result;
  }

  // Build the updates map
  const updates: Record<string, string> = {};
  for (const websiteKey of keys) {
    const engineKey = ENGINE_KEY_MAP[websiteKey];
    if (!engineKey) {
      result.failed.push({ key: websiteKey, error: `No engine mapping for key "${websiteKey}"` });
      continue;
    }
    // Read the value from the website's ServiceConfig DB
    const [service, ...keyParts] = websiteKey.split(":");
    const key = keyParts.join(":");
    const row = await db.serviceConfig.findUnique({
      where: { service_key: { service, key } },
    });
    if (!row) {
      result.failed.push({ key: websiteKey, error: `No value stored in website DB for "${websiteKey}".` });
      continue;
    }
    updates[engineKey] = row.value;
  }

  if (Object.keys(updates).length === 0) {
    return result;
  }

  try {
    const res = await fetch(`${engineUrl}/api/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ updates }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      result.message = `Engine returned HTTP ${res.status}: ${text.slice(0, 200)}`;
      for (const k of Object.keys(updates)) {
        result.failed.push({ key: k, error: `Engine HTTP ${res.status}` });
      }
      return result;
    }

    const data = await res.json();
    // Map engine keys back to website keys for the response
    const engineKeyToWebsiteKey: Record<string, string> = {};
    for (const [wk, ek] of Object.entries(ENGINE_KEY_MAP)) {
      engineKeyToWebsiteKey[ek] = wk;
    }
    for (const ek of data.updated || []) {
      result.pushed.push(engineKeyToWebsiteKey[ek] || ek);
    }
    for (const [ek, err] of Object.entries(data.failed || {})) {
      result.failed.push({ key: engineKeyToWebsiteKey[ek] || ek, error: String(err) });
    }
    return result;
  } catch (err) {
    result.unreachable = true;
    result.message = `Could not reach engine at ${engineUrl}: ${err instanceof Error ? err.message : String(err)}`;
    for (const k of Object.keys(updates)) {
      result.failed.push({ key: k, error: "Engine unreachable" });
    }
    return result;
  }
}

async function pushToScraper(keys: string[]): Promise<PushResult> {
  const scraperUrl = await getScraperUrl();
  // The scraper doesn't enforce auth on /api/env-config currently, but we forward
  // the SCRAPER_API_KEY if set (forward-compatible for when auth is added).
  const scraperKeyRow = await db.serviceConfig.findUnique({
    where: { service_key: { service: "scraper", key: "api_key" } },
  });
  const scraperApiKey = scraperKeyRow?.value || process.env.SCRAPER_API_KEY || "";

  const result: PushResult = { service: "scraper", pushed: [], failed: [] };

  const updates: Record<string, string> = {};
  for (const websiteKey of keys) {
    const scraperEnvKey = SCRAPER_KEY_MAP[websiteKey];
    if (!scraperEnvKey) {
      result.failed.push({ key: websiteKey, error: `No scraper mapping for key "${websiteKey}"` });
      continue;
    }
    const [service, ...keyParts] = websiteKey.split(":");
    const key = keyParts.join(":");
    const row = await db.serviceConfig.findUnique({
      where: { service_key: { service, key } },
    });
    if (!row) {
      result.failed.push({ key: websiteKey, error: `No value stored in website DB for "${websiteKey}".` });
      continue;
    }
    updates[scraperEnvKey] = row.value;
  }

  if (Object.keys(updates).length === 0) {
    return result;
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (scraperApiKey) headers["X-API-Key"] = scraperApiKey;

    const res = await fetch(`${scraperUrl}/api/env-config`, {
      method: "POST",
      headers,
      body: JSON.stringify({ updates }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      result.message = `Scraper returned HTTP ${res.status}: ${text.slice(0, 200)}`;
      for (const k of Object.keys(updates)) {
        result.failed.push({ key: k, error: `Scraper HTTP ${res.status}` });
      }
      return result;
    }

    const data = await res.json();
    const scraperKeyToWebsiteKey: Record<string, string> = {};
    for (const [wk, sk] of Object.entries(SCRAPER_KEY_MAP)) {
      scraperKeyToWebsiteKey[sk] = wk;
    }
    for (const sk of data.updated || []) {
      result.pushed.push(scraperKeyToWebsiteKey[sk] || sk);
    }
    for (const [sk, err] of Object.entries(data.failed || {})) {
      result.failed.push({ key: scraperKeyToWebsiteKey[sk] || sk, error: String(err) });
    }
    return result;
  } catch (err) {
    result.unreachable = true;
    result.message = `Could not reach scraper at ${scraperUrl}: ${err instanceof Error ? err.message : String(err)}`;
    for (const k of Object.keys(updates)) {
      result.failed.push({ key: k, error: "Scraper unreachable" });
    }
    return result;
  }
}

// POST /api/admin/config/push — push website DB config values to engine/scraper
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as PushRequest;
    if (!body.service || !["engine", "scraper"].includes(body.service)) {
      return NextResponse.json({ error: "service must be 'engine' or 'scraper'" }, { status: 400 });
    }
    if (!Array.isArray(body.keys) || body.keys.length === 0) {
      return NextResponse.json({ error: "keys must be a non-empty array" }, { status: 400 });
    }

    const result = body.service === "engine"
      ? await pushToEngine(body.keys)
      : await pushToScraper(body.keys);

    // Log the push attempt to ActivityLog
    await db.activityLog.create({
      data: {
        userId: (session.user as { id: string }).id,
        action: "CONFIG_PUSH",
        service: body.service,
        details: JSON.stringify({
          pushed: result.pushed,
          failed: result.failed,
          unreachable: result.unreachable,
        }),
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[admin/config/push] POST error:", error);
    return NextResponse.json(
      { error: "Failed to push config: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

// GET /api/admin/config/push?service=engine|scraper — fetch current values FROM the remote service
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const service = url.searchParams.get("service");
    if (!service || !["engine", "scraper"].includes(service)) {
      return NextResponse.json({ error: "service query param required (engine or scraper)" }, { status: 400 });
    }

    if (service === "engine") {
      const engineUrl = await getEngineUrl();
      const apiKey = await getEngineApiKey();
      if (!apiKey) {
        return NextResponse.json({ error: "Engine API key not configured on website" }, { status: 400 });
      }
      try {
        const res = await fetch(`${engineUrl}/api/config`, {
          headers: { "X-API-Key": apiKey },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          return NextResponse.json({ error: `Engine returned HTTP ${res.status}` }, { status: 502 });
        }
        const data = await res.json();
        return NextResponse.json(data);
      } catch (err) {
        return NextResponse.json(
          { error: `Could not reach engine: ${err instanceof Error ? err.message : String(err)}` },
          { status: 502 }
        );
      }
    } else {
      const scraperUrl = await getScraperUrl();
      try {
        const res = await fetch(`${scraperUrl}/api/env-config`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          return NextResponse.json({ error: `Scraper returned HTTP ${res.status}` }, { status: 502 });
        }
        const data = await res.json();
        return NextResponse.json(data);
      } catch (err) {
        return NextResponse.json(
          { error: `Could not reach scraper: ${err instanceof Error ? err.message : String(err)}` },
          { status: 502 }
        );
      }
    }
  } catch (error) {
    console.error("[admin/config/push] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch remote config" }, { status: 500 });
  }
}
