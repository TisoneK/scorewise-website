import { db } from "@/lib/db-libsql";

/**
 * Get a config value from the database, falling back to the provided default.
 * Returns the string value or null if not found.
 */
export async function getConfig(service: string, key: string, defaultValue?: string): Promise<string | null> {
  const row = await db.serviceConfig.findUnique({ where: { service_key: { service, key } } });
  if (row) return row.value;
  return defaultValue ?? null;
}

/**
 * Get all config values for a service as a key-value map.
 */
export async function getServiceConfig(service: string): Promise<Record<string, string>> {
  const rows = await db.serviceConfig.findMany({ where: { service } });
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

/**
 * Get the engine URL — checks DB first, falls back to env/hardcoded.
 */
export async function getEngineUrl(): Promise<string> {
  return (await getConfig("engine", "url")) || process.env.ENGINE_URL || "https://scorewise-engine.up.railway.app";
}

/**
 * Get the engine API key — checks DB first, falls back to env.
 */
export async function getEngineApiKey(): Promise<string> {
  return (await getConfig("engine", "api_key")) || process.env.SCOREWISE_API_KEY || "";
}

/**
 * Get the scraper URL — checks DB first, falls back to env/hardcoded.
 */
export async function getScraperUrl(): Promise<string> {
  return (await getConfig("scraper", "url")) || process.env.SCRAPER_URL || "https://flashscore-scraper.up.railway.app";
}

/**
 * Initialize default configs in the database if they don't exist.
 * Called on first admin dashboard load.
 */
export async function seedDefaultConfigs(): Promise<void> {
  const defaults = [
    { service: "engine", key: "url", value: "https://scorewise-engine.up.railway.app", secret: false },
    { service: "engine", key: "api_key", value: process.env.SCOREWISE_API_KEY || "", secret: true },
    { service: "scraper", key: "url", value: "https://flashscore-scraper.up.railway.app", secret: false },
    { service: "scraper", key: "api_key", value: "", secret: true },
    { service: "scraper", key: "cron_schedule", value: "0 6 * * *", secret: false },
    { service: "scraper", key: "type", value: "api_server", secret: false },
    { service: "scraper", key: "webhook_url", value: "https://scorewise-engine.up.railway.app/api/ingest", secret: false },
    { service: "website", key: "auto_refresh_seconds", value: "60", secret: false },
    { service: "website", key: "max_predictions_display", value: "50", secret: false },
    // Phase 4: shared HMAC secret for verifying engine → website webhooks.
    // When empty, all inbound webhooks are rejected (fail-closed).
    { service: "website", key: "webhook_secret", value: process.env.WEBHOOK_SECRET || "", secret: true },
    // Phase 4: where the engine should POST its push notifications.
    // Defaults to the public website URL so it works out-of-the-box on Vercel.
    { service: "website", key: "webhook_url", value: process.env.WEBSITE_WEBHOOK_URL || process.env.NEXTAUTH_URL || "", secret: false },
  ];

  for (const d of defaults) {
    await db.serviceConfig.upsert({
      where: { service_key: { service: d.service, key: d.key } },
      update: {},
      create: d,
    });
  }
}
