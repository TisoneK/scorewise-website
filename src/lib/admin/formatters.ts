/**
 * Pure formatting helpers used across the admin dashboard.
 *
 * Extracted from src/app/page.tsx during the Phase A modularization.
 * These functions have no React dependencies and can be safely tree-shaken.
 */

/**
 * Format an ISO timestamp as a human-readable absolute time string.
 * Returns "—" for null/undefined.
 */
export function formatTime(t: string | null | undefined): string {
  if (!t) return "—";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return t;
  }
}

/**
 * Format an ISO timestamp as a relative time string (e.g. "5s ago", "2m ago").
 * Useful for live event feeds where absolute time is less useful than
 * "how long ago did this happen".
 */
export function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Mask a secret value for display — shows first 4 + last 4 chars only.
 * Used by the Configuration tab to safely reveal secret values.
 */
export function maskDisplay(masked: string, hasValue: boolean): string {
  if (!hasValue) return "(not set)";
  return masked || "••••••••";
}

/**
 * Render a human-readable summary of an activity log entry's details payload.
 * Used by the Activity Log tab.
 */
export function renderLogDetails(
  action: string,
  details: Record<string, unknown>,
): string {
  if (action.startsWith("CONFIG_")) {
    const key = details.key as string;
    if (action === "CONFIG_CREATE") return `Created "${key}"`;
    if (action === "CONFIG_UPDATE") return `Updated "${key}"`;
    if (action === "CONFIG_DELETE") return `Deleted "${key}"`;
  }
  if (action === "USER_CREATE")
    return `Created user ${details.createdEmail || ""} (${details.createdRole || ""})`;
  if (action === "USER_DELETE")
    return `Deleted user ${details.deletedEmail || ""} (${details.deletedRole || ""})`;
  if (action === "USER_ROLE_CHANGE")
    return `Changed ${details.targetEmail || ""}: ${details.oldRole || ""} → ${details.newRole || ""}`;
  if (action === "SERVICE_CHECK")
    return `Checked ${details.url || "service"}`;
  if (action === "SERVICE_TRIGGER") {
    const op = details.operation || "unknown";
    if (op === "scrape_results") {
      return `Triggered results scrape for ${details.date || "today"}`;
    }
    if (op === "manual_scrape") {
      return `Triggered match scrape for ${details.day || "Today"}`;
    }
    return `Triggered: ${op}`;
  }
  if (action === "RESULT_UPDATE") {
    const home = details.homeTeam as string;
    const away = details.awayTeam as string;
    const homeScore = details.homeScore as number | null;
    const awayScore = details.awayScore as number | null;
    const status = details.resultStatus as string;
    const source = details.resultSource as string;
    const scoreStr = (homeScore != null && awayScore != null) ? `${homeScore}-${awayScore}` : "no score";
    return `${home} vs ${away}: ${scoreStr} (${status}, ${source})`;
  }
  if (action === "BET_CODE_UPDATE") {
    const home = details.homeTeam as string;
    const away = details.awayTeam as string;
    const code = details.betCode as string | null;
    return `${home} vs ${away}: ${code ? `code "${code}"` : "cleared"}`;
  }
  if (action === "SCRAPER_RESULTS_PUSH") {
    const date = details.date as string | null;
    const stored = details.stored as number;
    const skipped = details.skipped as number;
    const errors = details.errors as number;
    return `${date || "today"}: ${stored} stored, ${skipped} skipped, ${errors} errors`;
  }
  if (action === "ENGINE_PREDICTIONS_UPDATED") {
    const total = details.total as number;
    const stored = details.stored_new as number;
    const updated = details.updated_existing as number;
    return `${total} total (${stored} new, ${updated} updated)`;
  }
  if (action === "ENGINE_INGEST_COMPLETE") {
    const total = details.total as number;
    const succeeded = details.succeeded as number;
    const failed = details.failed as number;
    return `${succeeded}/${total} succeeded, ${failed} failed`;
  }
  if (action === "CONFIG_PUSH") {
    const pushed = details.pushed as unknown[];
    const failed = details.failed as unknown[];
    return `Pushed ${pushed?.length || 0} key(s), ${failed?.length || 0} failed`;
  }
  return JSON.stringify(details);
}
