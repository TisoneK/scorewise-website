import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClient } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users/stats
 *
 * Returns all users with their activity stats:
 * - totalLogins
 * - lastLogin (timestamp)
 * - totalActions
 *
 * Admin only.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;
    if (!session || role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }

    const client = getClient();

    // Get all users
    const usersResult = await client.execute(
      "SELECT id, email, name, role, createdAt FROM User ORDER BY createdAt DESC"
    );

    const users = [];
    for (const u of usersResult.rows) {
      const user = u as any;
      // Get login count
      const loginResult = await client.execute(
        "SELECT COUNT(*) as count FROM ActivityLog WHERE userId = ? AND action = 'USER_LOGIN'",
        [user.id]
      );
      const totalLogins = Number((loginResult.rows[0] as any).count);

      // Get last login
      const lastLoginResult = await client.execute(
        "SELECT createdAt FROM ActivityLog WHERE userId = ? AND action = 'USER_LOGIN' ORDER BY createdAt DESC LIMIT 1",
        [user.id]
      );
      const lastLogin = lastLoginResult.rows.length > 0
        ? (lastLoginResult.rows[0] as any).createdAt
        : null;

      // Get total actions
      const totalResult = await client.execute(
        "SELECT COUNT(*) as count FROM ActivityLog WHERE userId = ?",
        [user.id]
      );
      const totalActions = Number((totalResult.rows[0] as any).count);

      users.push({
        ...user,
        totalLogins,
        lastLogin,
        totalActions,
      });
    }

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[users/stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user stats: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    );
  }
}
