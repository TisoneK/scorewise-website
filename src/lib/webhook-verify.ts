/**
 * webhook-verify.ts
 *
 * Verifies the HMAC-SHA256 signature on inbound webhooks from the
 * ScoreWise engine. The engine signs the raw JSON body bytes with
 * WEBSITE_WEBHOOK_SECRET (shared secret) and sends the hex signature
 * in the X-ScoreWise-Signature header.
 *
 * The website verifies by recomputing the HMAC over the same body bytes
 * and comparing in constant time (crypto.timingSafeEqual).
 *
 * Secret lookup order:
 *   1. process.env.WEBHOOK_SECRET
 *   2. process.env.WEBSITE_WEBHOOK_SECRET
 *   3. ServiceConfig row (service="website", key="webhook_secret") in Turso
 *
 * The DB fallback exists so the admin dashboard's Config tab can manage the
 * secret without requiring a Vercel redeploy. If neither env nor DB has a
 * secret, all webhooks are rejected (fail-closed).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db-libsql";

const SIGNATURE_HEADER = "x-scorewise-signature";

export function getWebhookSecret(): string {
  // Sync version — checks env vars only. Kept for backwards compat.
  return process.env.WEBHOOK_SECRET || process.env.WEBSITE_WEBHOOK_SECRET || "";
}

/**
 * Async version — checks the ServiceConfig DB table FIRST (admin-managed
 * via the Config tab), then falls back to env vars.
 *
 * DB is preferred because:
 *   - The admin Config tab is the canonical place to manage runtime config
 *   - Env vars require a Vercel redeploy to change; DB values don't
 *   - If an admin sets the secret via the UI, that should win
 *
 * If DB row is empty/missing, falls back to env vars for backwards compat.
 */
export async function getWebhookSecretAsync(): Promise<string> {
  try {
    const row = await db.serviceConfig.findUnique({
      where: { service_key: { service: "website", key: "webhook_secret" } },
    });
    if (row?.value) return row.value;
  } catch {
    // DB read failed — fall through to env
  }
  return process.env.WEBHOOK_SECRET || process.env.WEBSITE_WEBHOOK_SECRET || "";
}

export function getSignatureHeader(request: Request): string {
  // Headers are case-insensitive on the Headers object — `get` lowercases.
  return request.headers.get(SIGNATURE_HEADER) || "";
}

/**
 * Verify the webhook signature.
 *
 * @param bodyBytes Raw request body as Uint8Array (use `await request.arrayBuffer()`)
 * @param signature Hex-encoded HMAC-SHA256 from the X-ScoreWise-Signature header
 * @param secret Shared secret (defaults to process.env.WEBHOOK_SECRET)
 * @returns true if signature matches, false otherwise
 */
export function verifyWebhookSignature(
  bodyBytes: Uint8Array,
  signature: string,
  secret: string = getWebhookSecret(),
): boolean {
  if (!secret) {
    // Webhook secret not configured — reject all webhooks.
    return false;
  }
  if (!signature) {
    return false;
  }

  // Compute expected HMAC-SHA256 in hex
  const expected = createHmac("sha256", secret).update(bodyBytes).digest("hex");

  // Convert both to Uint8Array of equal length for constant-time comparison
  const expectedBytes = Buffer.from(expected, "hex");
  const signatureBytes = Buffer.from(signature, "hex");

  // Length mismatch means signature is malformed — reject without timing info
  if (expectedBytes.length !== signatureBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, signatureBytes);
}

/**
 * Convenience: read+verify the body of an incoming webhook request.
 *
 * Returns the parsed JSON body on success, or null on verification failure
 * (signature missing, signature mismatch, or secret not configured).
 *
 * On success, callers can trust the body was signed by the engine.
 *
 * NOTE: This sync version only checks env vars. For DB-backed secret lookup,
 * use readAndVerifyWebhookBodyAsync() in route handlers.
 */
export async function readAndVerifyWebhookBody<T = unknown>(request: Request): Promise<T | null> {
  const secret = getWebhookSecret();
  if (!secret) {
    return null;
  }
  const signature = getSignatureHeader(request);
  if (!signature) {
    return null;
  }
  const bodyBytes = new Uint8Array(await request.arrayBuffer());
  if (!verifyWebhookSignature(bodyBytes, signature, secret)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(bodyBytes).toString("utf-8")) as T;
  } catch {
    return null;
  }
}

/**
 * Async version that consults both env vars AND the ServiceConfig DB table.
 * Use this in route handlers — it picks up secrets set via the admin Config
 * tab without requiring a Vercel redeploy.
 */
export async function readAndVerifyWebhookBodyAsync<T = unknown>(request: Request): Promise<T | null> {
  const secret = await getWebhookSecretAsync();
  if (!secret) {
    return null;
  }
  const signature = getSignatureHeader(request);
  if (!signature) {
    return null;
  }
  const bodyBytes = new Uint8Array(await request.arrayBuffer());
  if (!verifyWebhookSignature(bodyBytes, signature, secret)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(bodyBytes).toString("utf-8")) as T;
  } catch {
    return null;
  }
}

/**
 * Standard webhook envelope expected from the engine.
 */
export interface WebhookEnvelope<T = unknown> {
  event: string;
  timestamp: string; // ISO 8601
  data: T;
}
