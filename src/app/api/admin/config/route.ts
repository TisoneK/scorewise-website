import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { seedDefaultConfigs } from "@/lib/service-config";

// GET /api/admin/config — Get all service configurations
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure defaults exist
    await seedDefaultConfigs();

    const configs = await db.serviceConfig.findMany({
      orderBy: [{ service: "asc" }, { key: "asc" }],
    });

    // Mask secret values
    const masked = configs.map((c) => ({
      ...c,
      value: c.secret ? maskValue(c.value) : c.value,
      _hasValue: c.value.length > 0,
    }));

    return NextResponse.json({ configs: masked });
  } catch (error) {
    console.error("[admin/config] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch configs" }, { status: 500 });
  }
}

// POST /api/admin/config — Create or update a config entry
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { service, key, value, secret } = await request.json();

    if (!service || !key) {
      return NextResponse.json({ error: "Service and key are required" }, { status: 400 });
    }

    const validServices = ["scraper", "engine", "website"];
    if (!validServices.includes(service)) {
      return NextResponse.json({ error: `Service must be one of: ${validServices.join(", ")}` }, { status: 400 });
    }

    // Get old value for audit log
    const existing = await db.serviceConfig.findUnique({
      where: { service_key: { service, key } },
    });

    const config = await db.serviceConfig.upsert({
      where: { service_key: { service, key } },
      update: { value: value ?? "", secret: secret ?? false },
      create: { service, key, value: value ?? "", secret: secret ?? false },
    });

    // Log the change
    await db.activityLog.create({
      data: {
        userId: (session.user as { id: string }).id,
        action: existing ? "CONFIG_UPDATE" : "CONFIG_CREATE",
        service,
        details: JSON.stringify({
          key,
          oldValue: existing ? (existing.secret ? "***" : existing.value) : null,
          newValue: config.secret ? "***" : config.value,
          secret: config.secret,
        }),
      },
    });

    return NextResponse.json({
      config: {
        ...config,
        value: config.secret ? maskValue(config.value) : config.value,
        _hasValue: config.value.length > 0,
      },
    });
  } catch (error) {
    console.error("[admin/config] POST error:", error);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}

// DELETE /api/admin/config — Delete a config entry
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { service, key } = await request.json();
    if (!service || !key) {
      return NextResponse.json({ error: "Service and key are required" }, { status: 400 });
    }

    // Prevent deleting critical keys
    const criticalKeys = ["engine:url", "engine:api_key", "scraper:url"];
    if (criticalKeys.includes(`${service}:${key}`)) {
      return NextResponse.json(
        { error: `Cannot delete critical config "${key}". Update its value instead.` },
        { status: 400 }
      );
    }

    const existing = await db.serviceConfig.findUnique({
      where: { service_key: { service, key } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    await db.serviceConfig.delete({ where: { id: existing.id } });

    // Log the deletion
    await db.activityLog.create({
      data: {
        userId: (session.user as { id: string }).id,
        action: "CONFIG_DELETE",
        service,
        details: JSON.stringify({ key, deletedValue: existing.secret ? "***" : existing.value }),
      },
    });

    return NextResponse.json({ message: "Config deleted" });
  } catch (error) {
    console.error("[admin/config] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete config" }, { status: 500 });
  }
}

// PUT /api/admin/config — Test a service connection with provided config
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { service, testType } = await request.json();

    if (service === "engine") {
      const engineUrl = (await db.serviceConfig.findUnique({ where: { service_key: { service: "engine", key: "url" } } }))?.value
        || "https://scorewise-engine.up.railway.app";
      const apiKey = (await db.serviceConfig.findUnique({ where: { service_key: { service: "engine", key: "api_key" } } }))?.value
        || "";

      try {
        const res = await fetch(`${engineUrl}/api/predictions`, {
          headers: { "X-API-Key": apiKey },
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          const data = await res.json();
          return NextResponse.json({
            success: true,
            status: "online",
            statusCode: res.status,
            message: `Engine is online. ${data?.total ?? 0} predictions available.`,
            details: { url: engineUrl, hasApiKey: apiKey.length > 0 },
          });
        }
        if (res.status === 401 || res.status === 403) {
          return NextResponse.json({
            success: false,
            status: "error",
            statusCode: res.status,
            message: "Auth failed — API key is invalid or missing. Check the engine API key configuration.",
            details: { url: engineUrl, hasApiKey: apiKey.length > 0 },
          });
        }
        return NextResponse.json({
          success: false,
          status: "degraded",
          statusCode: res.status,
          message: `Engine responded with status ${res.status}. Service may be starting up or experiencing issues.`,
          details: { url: engineUrl, hasApiKey: apiKey.length > 0 },
        });
      } catch {
        return NextResponse.json({
          success: false,
          status: "offline",
          message: `Could not reach engine at ${engineUrl}. Check the URL and ensure the service is running.`,
          details: { url: engineUrl, hasApiKey: apiKey.length > 0 },
        });
      }
    }

    if (service === "scraper") {
      const scraperUrl = (await db.serviceConfig.findUnique({ where: { service_key: { service: "scraper", key: "url" } } }))?.value
        || "https://flashscore-scraper.up.railway.app";
      const scraperType = (await db.serviceConfig.findUnique({ where: { service_key: { service: "scraper", key: "type" } } }))?.value
        || "cron";

      try {
        const res = await fetch(`${scraperUrl}/health`, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return NextResponse.json({
            success: true,
            status: "online",
            statusCode: res.status,
            message: "Scraper is online and responding.",
            details: { url: scraperUrl, type: scraperType },
          });
        }
        return NextResponse.json({
          success: true,
          status: "degraded",
          statusCode: res.status,
          message: `Scraper responded with status ${res.status}. May be starting up.`,
          details: { url: scraperUrl, type: scraperType },
        });
      } catch {
        return NextResponse.json({
          success: true,
          status: scraperType === "cron" ? "offline" : "offline",
          message: scraperType === "cron"
            ? "Scraper is unreachable, which is expected for a cron-only service. It wakes up only during scheduled runs."
            : `Could not reach scraper at ${scraperUrl}. Check the URL configuration.`,
          details: { url: scraperUrl, type: scraperType },
        });
      }
    }

    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  } catch (error) {
    console.error("[admin/config] PUT error:", error);
    return NextResponse.json({ error: "Failed to test connection" }, { status: 500 });
  }
}

function maskValue(value: string): string {
  if (!value || value.length === 0) return "";
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••" + value.slice(-4);
}
