import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, getClient } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

// GET /api/admin/logs — Get activity logs
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");
    const service = searchParams.get("service");
    const action = searchParams.get("action");

    const where: Record<string, unknown> = {};
    if (service) where.service = service;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      db.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { email: true, name: true },
          },
        },
      }),
      db.activityLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, limit, offset });
  } catch (error) {
    console.error("[admin/logs] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}

// DELETE /api/admin/logs?confirm=all — Permanently clear ALL activity logs.
// Used when resetting data between testing phases. The confirm=all query
// param is required so the history can't be wiped by an accidental DELETE.
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get("confirm") !== "all") {
      return NextResponse.json(
        { error: "Pass ?confirm=all to permanently delete every activity log entry" },
        { status: 400 },
      );
    }

    const client = getClient();
    const before = await client.execute("SELECT COUNT(*) as c FROM ActivityLog");
    const count = Number(before.rows[0]?.c ?? 0);
    await client.execute("DELETE FROM ActivityLog");
    return NextResponse.json({ ok: true, deleted: count });
  } catch (error) {
    console.error("[admin/logs] DELETE error:", error);
    return NextResponse.json({ error: "Failed to clear logs" }, { status: 500 });
  }
}
