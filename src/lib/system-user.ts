/**
 * system-user.ts
 *
 * Find-or-create a sentinel "system" user for activity-log entries that
 * aren't tied to a human (e.g. inbound webhooks from the engine).
 *
 * The ActivityLog table requires a non-nullable userId with a foreign key
 * to User. Rather than alter the schema (which would require a migration
 * and add nullable complexity to every query), we keep a single row:
 *
 *   id: "system"
 *   email: "system@scorewise.local"
 *   name: "System (Engine Webhook)"
 *   role: "ADMIN"
 *   passwordHash: "!" (placeholder — login impossible; not a valid hash)
 *
 * The first webhook call upserts this row; subsequent calls reuse it.
 *
 * Uses the existing `db.user` API so we don't bypass any logging/validation
 * that may be added there in the future.
 */

import { db } from "@/lib/db-libsql";

export const SYSTEM_USER_ID = "system";
const SYSTEM_USER_EMAIL = "system@scorewise.local";

/**
 * Get the system user's ID, creating the row if necessary.
 * Returns the string ID on success, or null on failure (DB unavailable).
 *
 * Idempotent — safe to call on every webhook.
 */
export async function ensureSystemUser(): Promise<string | null> {
  try {
    // Fast path: look up existing.
    const existing = await db.user.findUnique({
      where: { id: SYSTEM_USER_ID },
      select: { id: true },
    });
    if (existing) {
      return SYSTEM_USER_ID;
    }

    // Slow path: create. If a concurrent request beats us, the second insert
    // will throw on the primary-key constraint — we catch and re-lookup.
    try {
      await db.user.create({
        data: {
          id: SYSTEM_USER_ID,
          email: SYSTEM_USER_EMAIL,
          name: "System (Engine Webhook)",
          passwordHash: "!", // invalid hash — login impossible
          role: "ADMIN",
        },
      });
      return SYSTEM_USER_ID;
    } catch {
      // Race condition: another worker created it first. Look it up again.
      const retry = await db.user.findUnique({
        where: { id: SYSTEM_USER_ID },
        select: { id: true },
      });
      return retry ? SYSTEM_USER_ID : null;
    }
  } catch (error) {
    console.error("[system-user] Failed to ensure system user:", error);
    return null;
  }
}
