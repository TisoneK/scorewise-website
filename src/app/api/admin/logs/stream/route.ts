import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";
import {
  getEngineUrl,
  getEngineApiKey,
  getScraperUrl,
} from "@/lib/service-config";

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // Vercel serverless function timeout (seconds)

/**
 * GET /api/admin/logs/stream?service=engine|scraper&since=...&limit=...&level=...&q=...
 *
 * Proxies a request to the engine's or scraper's /api/logs endpoint and
 * returns the JSON response. Used by the admin dashboard's "Service Logs"
 * tab to show live operational logs from the running services without
 * requiring SSH or Railway dashboard access.
 *
 * Auth:
 *   - Caller must have an active NextAuth ADMIN session.
 *   - Forwards the appropriate API key as X-API-Key to the upstream service:
 *     * engine  → SCOREWISE_API_KEY (from DB or env)
 *     * scraper → scraper:api_key (from DB, falls back to SCRAPER_API_KEY env)
 *                 The scraper doesn't currently enforce auth on /api/logs,
 *                 but we forward the key for forward-compatibility.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const service = (searchParams.get("service") || "engine").toLowerCase();
    if (service !== "engine" && service !== "scraper") {
      return NextResponse.json(
        { error: "Invalid `service` param. Must be 'engine' or 'scraper'." },
        { status: 400 },
      );
    }

    // Resolve upstream URL + API key
    let baseUrl: string;
    let apiKey = "";
    if (service === "engine") {
      baseUrl = await getEngineUrl();
      apiKey = await getEngineApiKey();
    } else {
      baseUrl = await getScraperUrl();
      // Scraper doesn't currently enforce auth on /api/logs, but if a key
      // is configured in the DB we forward it (forward-compatible).
      const scraperKeyRow = await db.serviceConfig.findUnique({
        where: { service_key: { service: "scraper", key: "api_key" } },
      });
      apiKey = scraperKeyRow?.value || process.env.SCRAPER_API_KEY || "";
    }

    if (!baseUrl) {
      return NextResponse.json(
        { error: `${service} URL is not configured on the website.` },
        { status: 502 },
      );
    }

    // Build upstream URL, forwarding only known-safe query params
    const upstream = new URL("/api/logs", baseUrl);
    for (const key of ["since", "limit", "level", "q"]) {
      const val = searchParams.get(key);
      if (val) upstream.searchParams.set(key, val);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "scorewise-website/admin-logs-proxy",
    };
    if (apiKey) headers["X-API-Key"] = apiKey;

    let upstreamResp: Response;
    try {
      upstreamResp = await fetch(upstream.toString(), {
        headers,
        cache: "no-store",
        // AbortSignal.timeout is available in Node 18+ / Vercel runtime
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          error: `Could not reach ${service} at ${baseUrl}`,
          detail: msg,
          service,
        },
        { status: 502 },
      );
    }

    const text = await upstreamResp.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = {
        error: `${service} returned non-JSON response (HTTP ${upstreamResp.status})`,
        body: text.slice(0, 500),
      };
    }

    return NextResponse.json(body, { status: upstreamResp.status });
  } catch (error) {
    console.error("[admin/logs/stream] GET error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch service logs", detail: msg },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/logs/stream?service=engine|scraper
 *
 * Proxies a "clear buffer" request to the upstream service's /api/logs endpoint.
 */
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const service = (searchParams.get("service") || "engine").toLowerCase();
    if (service !== "engine" && service !== "scraper") {
      return NextResponse.json(
        { error: "Invalid `service` param. Must be 'engine' or 'scraper'." },
        { status: 400 },
      );
    }

    let baseUrl: string;
    let apiKey = "";
    if (service === "engine") {
      baseUrl = await getEngineUrl();
      apiKey = await getEngineApiKey();
    } else {
      baseUrl = await getScraperUrl();
      const scraperKeyRow = await db.serviceConfig.findUnique({
        where: { service_key: { service: "scraper", key: "api_key" } },
      });
      apiKey = scraperKeyRow?.value || process.env.SCRAPER_API_KEY || "";
    }

    if (!baseUrl) {
      return NextResponse.json(
        { error: `${service} URL is not configured on the website.` },
        { status: 502 },
      );
    }

    const upstream = new URL("/api/logs", baseUrl);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "scorewise-website/admin-logs-proxy",
    };
    if (apiKey) headers["X-API-Key"] = apiKey;

    let upstreamResp: Response;
    try {
      upstreamResp = await fetch(upstream.toString(), {
        method: "DELETE",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Could not reach ${service} at ${baseUrl}`, detail: msg },
        { status: 502 },
      );
    }

    const text = await upstreamResp.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: `${service} returned non-JSON response (HTTP ${upstreamResp.status})` };
    }

    return NextResponse.json(body, { status: upstreamResp.status });
  } catch (error) {
    console.error("[admin/logs/stream] DELETE error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to clear service logs", detail: msg },
      { status: 500 },
    );
  }
}
