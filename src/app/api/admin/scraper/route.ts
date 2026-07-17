import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScraperUrl, getEngineUrl, getEngineApiKey } from "@/lib/service-config";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

// POST /api/admin/scraper — Trigger a manual scrape run (admin + operator)
//
// Supported operations:
//   { day: "Today" | "Tomorrow" }                     — scrape scheduled matches
//   { operation: "scrape_results", date: "DD.MM.YYYY" } — scrape final scores for a date
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Unauthorized — admin or operator access required" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const scraperUrl = await getScraperUrl();
    const scraperApiKey = await getScraperApiKey();

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (scraperApiKey) headers["X-API-Key"] = scraperApiKey;

    // ── Branch 1: results scrape ─────────────────────────────────────────
    // Triggered by the Results tab's "Scrape Results" button.
    // Proxies to the scraper's POST /api/scrape/results endpoint.
    // The scraper then pushes final scores back via /api/webhook/result.
    if (body.operation === "scrape_results") {
      const date = body.date;
      if (!date || typeof date !== "string") {
        return NextResponse.json({ error: "date is required (DD.MM.YYYY format)" }, { status: 400 });
      }

      try {
        const res = await fetch(`${scraperUrl}/api/scrape/results`, {
          method: "POST",
          headers,
          body: JSON.stringify({ date }),
          signal: AbortSignal.timeout(30000),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          return NextResponse.json({
            status: "error",
            message: data.detail || data.message || `Scraper returned ${res.status}`,
          }, { status: res.status });
        }

        // Log the action
        await db.activityLog.create({
          data: {
            userId: (session.user as { id: string }).id,
            action: "SERVICE_TRIGGER",
            service: "scraper",
            details: JSON.stringify({ operation: "scrape_results", date, scrape_id: data.scrape_id }),
          },
        });

        return NextResponse.json({
          status: "triggered",
          message: data.message || `Results scrape started for ${date}`,
          run_id: data.scrape_id || data.run_id,
          date,
          operation: "scrape_results",
        });
      } catch (fetchError) {
        // The scraper might take longer than 30s to respond even though
        // it accepted the job. Don't treat this as a hard failure —
        // the scrape may still be running in the background.
        return NextResponse.json({
          status: "triggered",
          message: `Results scrape triggered for ${date} (scraper is processing in background)`,
          date,
          operation: "scrape_results",
        });
      }
    }

    // ── Branch 1b: kill all active scraper threads ──────────────────────
    // Proxies to the scraper's POST /api/scrape/kill endpoint.
    // Kills all queued + running jobs and zombie Chrome processes.
    if (body.operation === "kill_all") {
      try {
        const res = await fetch(`${scraperUrl}/api/scrape/kill`, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
      } catch (fetchError) {
        return NextResponse.json({
          status: "error",
          message: `Could not reach scraper to kill threads: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
        });
      }
    }

    // ── Branch 1c: resume the single-scrape queue ──────────────────────
    // Proxies to the scraper's POST /api/scrape/results/single/resume.
    if (body.operation === "resume_queue") {
      try {
        const res = await fetch(`${scraperUrl}/api/scrape/results/single/resume`, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(10000),
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
      } catch (fetchError) {
        return NextResponse.json({
          status: "error",
          message: `Could not reach scraper to resume queue: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
        });
      }
    }

    // ── Branch 2: scheduled-match scrape (default) ──────────────────────
    const day = body.day || "Today";
    if (!["Today", "Tomorrow"].includes(day)) {
      return NextResponse.json({ error: "day must be 'Today' or 'Tomorrow', or operation must be 'scrape_results'" }, { status: 400 });
    }

    try {
      const res = await fetch(`${scraperUrl}/api/scrape`, {
        method: "POST",
        headers,
        body: JSON.stringify({ day }),
        signal: AbortSignal.timeout(15000),
      });

      const data = await res.json();

      if (!res.ok) {
        return NextResponse.json({
          status: "error",
          message: data.detail || `Scraper returned ${res.status}`,
        }, { status: res.status });
      }

      // Log the action
      await db.activityLog.create({
        data: {
          userId: (session.user as { id: string }).id,
          action: "SERVICE_TRIGGER",
          service: "scraper",
          details: JSON.stringify({ operation: "manual_scrape", day, scrape_id: data.scrape_id }),
        },
      });

      // Map GitHub scraper response → frontend-expected format
      // GitHub scraper returns: { status: "accepted", scrape_id, message }
      return NextResponse.json({
        status: "triggered",
        message: data.message || `Scrape started for ${day}`,
        run_id: data.scrape_id || data.run_id,
        day,
      });
    } catch (fetchError) {
      return NextResponse.json({
        status: "offline",
        message: `Could not reach scraper at ${scraperUrl}. The scraper API server may not be running or the URL is incorrect.`,
        url: scraperUrl,
      });
    }
  } catch (error) {
    console.error("[admin/scraper] POST error:", error);
    return NextResponse.json({ error: "Failed to trigger scraper" }, { status: 500 });
  }
}

// GET /api/admin/scraper — Check scraper and engine status (operator and above)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Unauthorized — operator access or above required" }, { status: 401 });
    }

    const scraperUrl = await getScraperUrl();
    const engineUrl = await getEngineUrl();
    const apiKey = await getEngineApiKey();
    const scraperApiKey = await getScraperApiKey();

    // Check both services in parallel
    const [scraperResult, engineResult] = await Promise.allSettled([
      // Scraper: hit /api/status (GitHub version), then /health fallback
      (async () => {
        const headers: Record<string, string> = {};
        if (scraperApiKey) headers["X-API-Key"] = scraperApiKey;

        // Try /api/status — the GitHub scraper's status endpoint
        try {
          const res = await fetch(`${scraperUrl}/api/status`, {
            headers,
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const data = await res.json();
            // GitHub scraper /api/status returns:
            //   { status: "idle (no runs yet)" | "scraping" | "idle (last scrape succeeded)" | "idle (last scrape failed)",
            //     scraper_busy: bool, last_scrape: {...}, timestamp }
            const isRunning = data.scraper_busy === true;
            // Normalize status text for the frontend
            let scraperStatus: string;
            if (isRunning) {
              scraperStatus = "running";
            } else if (data.status?.includes("succeeded")) {
              scraperStatus = "idle";
            } else if (data.status?.includes("failed")) {
              scraperStatus = "error";
            } else if (data.status?.includes("no runs yet") || data.status?.includes("idle")) {
              // "idle (no runs yet)" = fresh deploy, never scraped — NOT an error
              scraperStatus = "idle";
            } else {
              scraperStatus = "idle";
            }

            // Map last_scrape → lastRun for frontend compatibility
            // The scraper returns last_scrape as an object even when no scrape has
            // run yet (all fields null). Only treat it as a "last run" if it has
            // a started_at timestamp — otherwise it's a fresh deploy with no history.
            const lastScrape = data.last_scrape;
            const hasRealLastRun = lastScrape && lastScrape.started_at;
            const lastRun = hasRealLastRun ? {
              status: lastScrape.success ? "success" : "error",
              error: lastScrape.error || null,
              scrape_type: lastScrape.scrape_type || null,
              day: lastScrape.day || null,
              date: lastScrape.date || null,
              complete_matches: lastScrape.complete_matches || 0,
              incomplete_matches: lastScrape.incomplete_matches || 0,
              started_at: lastScrape.started_at || null,
              finished_at: lastScrape.finished_at || null,
            } : null;

            // Also try to get progress if running
            let progress: { day?: string; current_match_index?: number; total_matches?: number } | null = null;
            if (isRunning) {
              try {
                const progRes = await fetch(`${scraperUrl}/api/scrape/progress`, {
                  headers,
                  signal: AbortSignal.timeout(5000),
                });
                if (progRes.ok) {
                  progress = await progRes.json();
                }
              } catch {}
            }

            return {
              status: "online" as const,
              statusCode: res.status,
              scraperStatus,
              lastRun,
              currentDay: isRunning ? (data.last_scrape?.day || progress?.day || "—") : null,
              progress,
              message: isRunning
                ? `Currently scraping${progress?.day ? ` ${progress.day}` : ""} (${progress?.current_match_index || 0}/${progress?.total_matches || "?"} matches)`
                : scraperStatus === "error" ? "Last scrape failed"
                : "Scraper is idle and ready",
            };
          }
        } catch {}

        // Fallback: try /health
        try {
          const res = await fetch(`${scraperUrl}/health`, {
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const data = await res.json();
            return {
              status: "online" as const,
              statusCode: res.status,
              scraperStatus: data.scraper_busy ? "running" : "idle",
              lastRun: null,
              currentDay: null,
              progress: null,
              message: "Scraper API is online",
            };
          }
          return { status: "degraded" as const, statusCode: res.status, scraperStatus: "unknown", lastRun: null, currentDay: null, progress: null };
        } catch {}

        // Fallback: try root URL
        try {
          const rootRes = await fetch(scraperUrl, {
            signal: AbortSignal.timeout(5000),
          });
          if (rootRes.ok) {
            return { status: "online" as const, statusCode: rootRes.status, scraperStatus: "unknown", lastRun: null, currentDay: null, progress: null };
          }
          return { status: "degraded" as const, statusCode: rootRes.status, scraperStatus: "unknown", lastRun: null, currentDay: null, progress: null };
        } catch {
          return { status: "offline" as const, statusCode: null, scraperStatus: "unknown", lastRun: null, currentDay: null, progress: null };
        }
      })(),

      // Engine: check with API key
      (async () => {
        if (!apiKey) {
          return { status: "error" as const, statusCode: null, message: "API key not configured" };
        }
        try {
          const res = await fetch(`${engineUrl}/api/predictions`, {
            headers: { "X-API-Key": apiKey },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const data = await res.json();
            return {
              status: "online" as const,
              statusCode: res.status,
              predictions: data.total ?? 0,
              message: `Online — ${data.total ?? 0} predictions`,
            };
          }
          if (res.status === 401 || res.status === 403) {
            return { status: "error" as const, statusCode: res.status, message: "Auth failed — check API key" };
          }
          // 404 from /api/predictions means the engine is up but the store
          // is empty (older engine builds return 404 instead of 200 with
          // total=0). Treat this as ONLINE with zero predictions so the
          // dashboard doesn't show a false "DEGRADED" state right after
          // a fresh engine deploy.
          if (res.status === 404) {
            return {
              status: "online" as const,
              statusCode: 404,
              predictions: 0,
              message: "Online — store empty (waiting for first ingest)",
            };
          }
          return { status: "degraded" as const, statusCode: res.status };
        } catch {
          return { status: "offline" as const, statusCode: null };
        }
      })(),
    ]);

    const scraper = scraperResult.status === "fulfilled" ? scraperResult.value : { status: "error" as const, scraperStatus: "unknown", lastRun: null, currentDay: null, progress: null };
    const engine = engineResult.status === "fulfilled" ? engineResult.value : { status: "error" as const };

    return NextResponse.json({
      scraper,
      engine,
      scraperUrl,
      engineUrl,
    });
  } catch (error) {
    console.error("[admin/scraper] Status error:", error);
    return NextResponse.json({ error: "Failed to check services" }, { status: 500 });
  }
}

// Helper to get scraper API key from DB config
async function getScraperApiKey(): Promise<string> {
  const row = await db.serviceConfig.findUnique({ where: { service_key: { service: "scraper", key: "api_key" } } });
  return row?.value || process.env.SCRAPER_API_KEY || "";
}
