/**
 * Returns a human-readable countdown to kickoff, e.g.:
 *   "in 2h 15m"     — match starts in 2 hours 15 min
 *   "in 45m"        — match starts in 45 minutes
 *   "in 5m"         — match starts in 5 minutes
 *   "starting now"  — match starts within 1 minute
 *   "started 10m ago" — match started 10 minutes ago (should be LIVE)
 *   "started 2h ago"  — match started 2 hours ago (should be AWAITING/FINAL)
 *
 * Returns null if the date/time can't be parsed.
 */
export function timeToKickoff(dateStr?: string | null, timeStr?: string | null): string | null {
  const matchDate = parseMatchDateTime(dateStr, timeStr);
  if (!matchDate) return null;

  const now = Date.now();
  const diffMs = matchDate.getTime() - now;

  if (Math.abs(diffMs) < 60_000) {
    // Within 1 minute
    return diffMs >= 0 ? "starting now" : "started just now";
  }

  const totalMinutes = Math.floor(Math.abs(diffMs) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (diffMs > 0) {
    // Future — countdown to kickoff
    if (hours > 0) {
      return `in ${hours}h ${mins}m`;
    }
    return `in ${mins}m`;
  } else {
    // Past — match already started
    if (hours > 0) {
      return `started ${hours}h ${mins}m ago`;
    }
    return `started ${mins}m ago`;
  }
}

/**
 * Returns a compact countdown suitable for badges/pills, e.g.:
 *   "2h 15m"   — future
 *   "45m"      — future
 *   "LIVE"     — within 5 minutes of kickoff (or past kickoff)
 *   "−10m"     — 10 minutes since kickoff (negative = past)
 *
 * Returns null if date can't be parsed.
 */
export function kickoffBadge(dateStr?: string | null, timeStr?: string | null): string | null {
  const matchDate = parseMatchDateTime(dateStr, timeStr);
  if (!matchDate) return null;

  const now = Date.now();
  const diffMs = matchDate.getTime() - now;
  const totalMinutes = Math.floor(Math.abs(diffMs) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (Math.abs(diffMs) < 5 * 60_000) {
    return "LIVE"; // within 5 min of kickoff
  }

  if (diffMs > 0) {
    // Future
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  } else {
    // Past
    if (hours > 0) return `−${hours}h ${mins}m`;
    return `−${mins}m`;
  }
}
