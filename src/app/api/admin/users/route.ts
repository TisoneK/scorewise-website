import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db-libsql";

export const dynamic = 'force-dynamic';

const VALID_ROLES = ["ADMIN", "OPERATOR", "USER"];

// Helper: check role from session
function getRole(session: any): string | null {
  if (!session?.user) return null;
  return (session.user as any).role || null;
}

// GET /api/admin/users — List all users (operator and above)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const role = getRole(session);
    if (role !== "ADMIN" && role !== "OPERATOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await db.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[admin/users] Error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

// POST /api/admin/users — Create a new user (admin only)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (getRole(session) !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized — admin access required" }, { status: 401 });
    }

    const { email, name, password, role } = await request.json();

    if (!email || !password || !role) {
      return NextResponse.json({ error: "Email, password, and role are required" }, { status: 400 });
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `Role must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "User with this email already exists" }, { status: 409 });
    }

    const passwordHash = await (await import("bcryptjs")).hash(password, 10);

    const user = await db.user.create({
      data: { email, name: name || null, passwordHash, role },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    // Log the action
    await db.activityLog.create({
      data: {
        userId: (session!.user as { id: string }).id,
        action: "USER_CREATE",
        service: "website",
        details: JSON.stringify({ createdEmail: email, createdRole: role }),
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("[admin/users] Error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

// PATCH /api/admin/users — Change a user's role (admin + operator)
// Operators can change USER → OPERATOR and back, but can't create admins
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = getRole(session);
    if (role !== "ADMIN" && role !== "OPERATOR") {
      return NextResponse.json({ error: "Unauthorized — admin or operator access required" }, { status: 401 });
    }

    const { userId, newRole } = await request.json();

    if (!userId || !newRole) {
      return NextResponse.json({ error: "userId and newRole are required" }, { status: 400 });
    }

    if (!VALID_ROLES.includes(newRole)) {
      return NextResponse.json({ error: `Role must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }

    // Operators can only manage USER ↔ OPERATOR, not create/promote to ADMIN
    if (role === "OPERATOR" && newRole === "ADMIN") {
      return NextResponse.json({ error: "Operators cannot promote users to admin" }, { status: 403 });
    }

    // Prevent changing your own role
    if (userId === (session!.user as { id: string }).id) {
      return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Operators can't modify other operators or admins
    if (role === "OPERATOR" && (existingUser.role === "ADMIN" || existingUser.role === "OPERATOR")) {
      return NextResponse.json({ error: "Operators can only manage regular users" }, { status: 403 });
    }

    const oldRole = existingUser.role;

    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { role: newRole },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    // Log the role change
    await db.activityLog.create({
      data: {
        userId: (session!.user as { id: string }).id,
        action: "USER_ROLE_CHANGE",
        service: "website",
        details: JSON.stringify({
          targetUserId: userId,
          targetEmail: existingUser.email,
          oldRole,
          newRole,
          changedBy: role,
        }),
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("[admin/users] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update user role" }, { status: 500 });
  }
}

// PUT /api/admin/users — Update user info (name) (admin + operator)
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = getRole(session);
    if (role !== "ADMIN" && role !== "OPERATOR") {
      return NextResponse.json({ error: "Unauthorized — admin or operator access required" }, { status: 401 });
    }

    const { userId, name } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, role: true } });
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Operators can't modify other operators or admins
    if (role === "OPERATOR" && (existingUser.role === "ADMIN" || existingUser.role === "OPERATOR")) {
      return NextResponse.json({ error: "Operators can only manage regular users" }, { status: 403 });
    }

    const oldName = existingUser.name;

    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { name: name || null },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    // Log the name change
    await db.activityLog.create({
      data: {
        userId: (session!.user as { id: string }).id,
        action: "USER_INFO_UPDATE",
        service: "website",
        details: JSON.stringify({
          targetUserId: userId,
          targetEmail: existingUser.email,
          oldName,
          newName: name || null,
          changedBy: role,
        }),
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("[admin/users] PUT error:", error);
    return NextResponse.json({ error: "Failed to update user info" }, { status: 500 });
  }
}

// DELETE /api/admin/users — Delete a user (admin + operator for regular users only)
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = getRole(session);
    if (role !== "ADMIN" && role !== "OPERATOR") {
      return NextResponse.json({ error: "Unauthorized — admin or operator access required" }, { status: 401 });
    }

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Prevent deleting yourself
    if (userId === (session!.user as { id: string }).id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    // Get user info before deleting (for logging + permission check)
    const userToDelete = await db.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
    if (!userToDelete) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Operators can only delete regular users, not other operators or admins
    if (role === "OPERATOR" && (userToDelete.role === "ADMIN" || userToDelete.role === "OPERATOR")) {
      return NextResponse.json({ error: "Operators can only delete regular users" }, { status: 403 });
    }

    await db.user.delete({ where: { id: userId } });

    // Log the action
    if (userToDelete) {
      await db.activityLog.create({
        data: {
          userId: (session!.user as { id: string }).id,
          action: "USER_DELETE",
          service: "website",
          details: JSON.stringify({ deletedEmail: userToDelete.email, deletedRole: userToDelete.role }),
        },
      });
    }

    return NextResponse.json({ message: "User deleted" });
  } catch (error) {
    console.error("[admin/users] Error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
