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
  if (action === "SERVICE_TRIGGER")
    return `Triggered: ${details.operation || "unknown"}`;
  return JSON.stringify(details);
}
