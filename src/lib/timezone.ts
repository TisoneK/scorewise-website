/**
 * timezone.ts — utilities for displaying match times in the user's local timezone.
 *
 * ## Why this exists
 * The scraper stores match times as observed on Flashscore, which renders in
 * UTC when no user timezone is set (the scraper doesn't set one). Storing as
 * UTC is correct — it's an unambiguous moment in time. But displaying "11:30"
 * to a user in Nairobi (EAT = UTC+3) when their local time is "14:30" is
 * confusing. This module converts UTC-stored times to the viewer's local TZ
 * for display.
 *
 * ## Source format
 * - date: "DD.MM.YYYY" (European format from Flashscore, e.g. "19.06.2026")
 * - time: "HH:MM" (24-hour, e.g. "11:30")
 * - Both are interpreted as UTC.
 *
 * ## Output format
 * - All display functions use the browser's local timezone automatically.
 * - A short TZ abbreviation (e.g. "EAT", "EST") is included where useful so
 *   the user knows what zone they're looking at.
 */

/**
 * Parse the scraper's date+time strings into a Date object representing the
 * UTC moment of kickoff.
 *
 * @param dateStr Date in DD.MM.YYYY format (e.g. "19.06.2026")
 * @param timeStr Time in HH:MM format (e.g. "11:30"). Optional — defaults to 00:00.
 * @returns Date object representing the UTC moment, or null if dateStr is invalid.
 */
export function parseMatchDateTime(dateStr?: string | null, timeStr?: string | null): Date | null {
  if (!dateStr) return null;
  const dateParts = dateStr.split(".");
  if (dateParts.length !== 3) return null;
  const [day, month, year] = dateParts.map(Number);
  if (!day || !month || !year) return null;

  let hour = 0;
  let minute = 0;
  if (timeStr) {
    const timeParts = timeStr.split(":");
    if (timeParts.length >= 2) {
      hour = parseInt(timeParts[0]) || 0;
      minute = parseInt(timeParts[1]) || 0;
    }
  }

  // Date.UTC interprets args as UTC — this is the key step.
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

/**
 * Format a date for display in the user's local timezone.
 * Returns e.g. "Fri, Jun 19".
 */
export function formatLocalDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Format a date with full weekday + month name for date group headers.
 * Returns e.g. "Friday, June 19".
 */
export function formatLocalDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Format a time for display in the user's local timezone.
 * Returns e.g. "14:30" (24-hour, no seconds).
 */
export function formatLocalTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Format a date+time combined for compact display.
 * Returns e.g. "Fri, Jun 19 · 14:30".
 */
export function formatLocalDateTime(d: Date): string {
  return `${formatLocalDate(d)} · ${formatLocalTime(d)}`;
}

/**
 * Get the user's IANA timezone (e.g. "Africa/Nairobi").
 * Falls back to "UTC" if not available.
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Get a short timezone abbreviation for display alongside times.
 * e.g. "EAT" for Africa/Nairobi, "EST" for America/New_York.
 *
 * Falls back to the UTC offset (e.g. "GMT+3") if the abbreviation can't
 * be resolved — this happens for some less-common timezones.
 */
export function getTimezoneAbbr(): string {
  const tz = getUserTimezone();
  // Common shortcuts — saves parsing work for the most likely zones.
  const known: Record<string, string> = {
    "Africa/Nairobi": "EAT",
    "Africa/Johannesburg": "SAST",
    "Africa/Lagos": "WAT",
    "Africa/Cairo": "EET",
    "Europe/London": "GMT",
    "Europe/Paris": "CET",
    "Europe/Berlin": "CET",
    "Europe/Madrid": "CET",
    "Europe/Moscow": "MSK",
    "America/New_York": "EST",
    "America/Chicago": "CST",
    "America/Denver": "MST",
    "America/Los_Angeles": "PST",
    "America/Sao_Paulo": "BRT",
    "Asia/Dubai": "GST",
    "Asia/Kolkata": "IST",
    "Asia/Shanghai": "CST",
    "Asia/Tokyo": "JST",
    "Asia/Singapore": "SGT",
    "Australia/Sydney": "AEDT",
    "UTC": "UTC",
  };
  if (known[tz]) return known[tz];

  // Try to extract from a formatted date string.
  try {
    const formatted = new Date().toLocaleTimeString("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    });
    const match = formatted.match(/([A-Z]{2,5})\s*$/);
    if (match) return match[1];
  } catch {
    // Fall through to offset
  }

  // Last resort: show the UTC offset (e.g. "GMT+3")
  try {
    const offset = -new Date().getTimezoneOffset() / 60;
    const sign = offset >= 0 ? "+" : "";
    return `GMT${sign}${offset}`;
  } catch {
    return tz.split("/").pop() || "UTC";
  }
}

/**
 * Check if a Date is "today" in the user's local timezone.
 * Used to filter the "Today's Top Picks" section.
 */
export function isTodayLocal(d: Date): boolean {
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

/**
 * Get a sortable YYYY-MM-DD string for a Date in the user's local timezone.
 * Used to group predictions by local date (not UTC date).
 */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
