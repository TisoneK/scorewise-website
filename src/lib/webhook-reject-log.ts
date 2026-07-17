import { ensureSystemUser } from "@/lib/system-user";
import { db } from "@/lib/db-libsql";

/**
 * Record a rejected inbound webhook in the activity log.
 *
 * A webhook that fails HMAC verification used to vanish without a trace —
 * the sender thinks it delivered, the receiver stored nothing, and the
 * admin dashboard showed no evidence either way (this blind spot made the
 * 2026-07-17 delivery outage undiagnosable from the website side). Now
 * every rejection is visible as a WEBHOOK_REJECTED activity entry.
 *
 * Never throws — rejection logging must not mask the 401 response.
 */
export async function logWebhookRejected(endpoint: string, service: string): Promise<void> {
  try {
    const systemUserId = await ensureSystemUser();
    if (!systemUserId) return;
    await db.activityLog.create({
      data: {
        userId: systemUserId,
        action: "WEBHOOK_REJECTED",
        service,
        details: JSON.stringify({
          endpoint,
          reason: "invalid or missing HMAC signature — check that the sender's webhook secret matches the website's WEBHOOK_SECRET env var (or ServiceConfig website/webhook_secret)",
          rejected_at: new Date().toISOString(),
        }),
      },
    });
  } catch (e) {
    console.error(`[${endpoint}] Failed to log webhook rejection:`, e);
  }
}
