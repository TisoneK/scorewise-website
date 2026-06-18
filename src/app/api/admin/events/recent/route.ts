import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/events/recent?limit=30
 *
 * Returns a unified, time-sorted list of recent "events" across the system,
 * suitable for the Overview tab's Live Event Feed.
 *
 * Event sources (merged + sorted by time, most recent first):
 *   - Activity log entries (admin actions: CONFIG_*, USER_*, SERVICE_*)
 *   - Recent predictions (treated as PREDICTION_NEW events)
 *
 * Each event has:
 *   - id          — stable unique id
 *   - timestamp   — ISO 8601
 *   - type        — short event type (e.g. "PREDICTION_NEW", "CONFIG_UPDATE", "SERVICE_TRIGGER")
 *   - service     — "scraper" | "engine" | "website" | null
 *   - title       — human-readable short label
 *   - detail      — human-readable longer description (optional)
 *   - severity    — "info" | "success" | "warning" | "error"
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);

    type Event = {
      id: string;
      timestamp: string;
      type: string;
      service: string | null;
      title: string;
      detail?: string;
      severity: "info" | "success" | "warning" | "error";
    };

    const events: Event[] = [];

    // 1. Activity log entries (admin actions)
    const activityLogs = await db.activityLog.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true, name: true } } },
    });
    for (const log of activityLogs) {
      let severity: Event["severity"] = "info";
      if (log.action.includes("DELETE")) severity = "warning";
      else if (log.action.includes("CREATE") || log.action.includes("TRIGGER")) severity = "success";
      else if (log.action.includes("ERROR") || log.action.includes("FAIL")) severity = "error";

      const title = log.action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      let detail: string | undefined;
      try {
        const d = JSON.parse(log.details || "{}");
        if (log.action === "SERVICE_TRIGGER") {
          detail = `Operation: ${d.operation || "unknown"}`;
        } else if (log.action.startsWith("CONFIG_")) {
          detail = `Key: ${d.key || "?"}`;
        } else if (log.action.startsWith("USER_")) {
          detail = `Target: ${d.createdEmail || d.deletedEmail || d.targetEmail || "?"}`;
        } else {
          detail = log.details || undefined;
        }
      } catch {
        detail = log.details || undefined;
      }

      events.push({
        id: `activity-${log.id}`,
        timestamp: log.createdAt,
        type: log.action,
        service: log.service,
        title,
        detail,
        severity,
      });
    }

    // 2. Recent predictions (treated as events)
    try {
      const origin = new URL(request.url).origin;
      const engineRes = await fetch(`${origin}/api/admin/engine`, {
        headers: { cookie: request.headers.get("cookie") || "" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (engineRes.ok) {
        const engineData = await engineRes.json();
        const preds: Array<{ match_id: string; success: boolean; confidence: string | null; recommendation: string | null; created_at: string | null }> =
          engineData?.predictions || [];
        // Take the most recent N — they're in chronological order from engine,
        // so reverse to get newest-first
        const recentPreds = preds.slice(-limit).reverse();
        for (const p of recentPreds) {
          events.push({
            id: `prediction-${p.match_id}`,
            timestamp: p.created_at || new Date().toISOString(),
            type: "PREDICTION_NEW",
            service: "engine",
            title: `Prediction: ${p.recommendation || "?"} (${p.confidence || "?"})`,
            detail: `Match ${p.match_id.slice(0, 12)} — ${p.success ? "✓ succeeded" : "✗ failed"}`,
            severity: p.success ? "success" : "error",
          });
        }
      }
    } catch {
      // Engine unreachable — skip predictions in the feed
    }

    // Sort all events by timestamp descending (newest first) and take top `limit`
    events.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return tb - ta;
    });
    const top = events.slice(0, limit);

    return NextResponse.json({
      events: top,
      total: top.length,
      sources: {
        activity: activityLogs.length,
        predictions: events.length - activityLogs.length,
      },
    });
  } catch (error) {
    console.error("[admin/events/recent] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recent events" },
      { status: 500 },
    );
  }
}
