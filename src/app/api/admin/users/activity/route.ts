import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClient } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users/activity?userId=xxx&limit=20
 *
 * Returns recent activity for a specific user.
 * Admin + Operator only.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
      return NextResponse.json({ error: "Admin or operator access required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const limit = Math.min(Number(searchParams.get("limit") || "20"), 100);

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const client = getClient();

    // Get user's recent activity
    const result = await client.execute(
      "SELECT * FROM ActivityLog WHERE userId = ? ORDER BY createdAt DESC LIMIT ?",
      [userId, limit]
    );

    // Get login count
    const loginResult = await client.execute(
      "SELECT COUNT(*) as count FROM ActivityLog WHERE userId = ? AND action = 'USER_LOGIN'",
      [userId]
    );
    const totalLogins = Number((loginResult.rows[0] as any).count);

    // Get last login
    const lastLoginResult = await client.execute(
      "SELECT createdAt FROM ActivityLog WHERE userId = ? AND action = 'USER_LOGIN' ORDER BY createdAt DESC LIMIT 1",
      [userId]
    );
    const lastLogin = lastLoginResult.rows.length > 0
      ? (lastLoginResult.rows[0] as any).createdAt
      : null;

    // Get total actions
    const totalResult = await client.execute(
      "SELECT COUNT(*) as count FROM ActivityLog WHERE userId = ?",
      [userId]
    );
    const totalActions = Number((totalResult.rows[0] as any).count);

    return NextResponse.json({
      activities: result.rows,
      totalLogins,
      totalActions,
      lastLogin,
    });
  } catch (error) {
    console.error("[users/activity] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user activity: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
