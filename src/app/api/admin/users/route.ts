import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/admin/users — List all users (admin only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
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
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, name, password, role } = await request.json();

    if (!email || !password || !role) {
      return NextResponse.json({ error: "Email, password, and role are required" }, { status: 400 });
    }

    if (!["ADMIN", "USER"].includes(role)) {
      return NextResponse.json({ error: "Role must be ADMIN or USER" }, { status: 400 });
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
        userId: (session.user as { id: string }).id,
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

// DELETE /api/admin/users — Delete a user (admin only)
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role: string })?.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Prevent deleting yourself
    if (userId === (session.user as { id: string }).id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    // Get user info before deleting (for logging)
    const userToDelete = await db.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });

    await db.user.delete({ where: { id: userId } });

    // Log the action
    if (userToDelete) {
      await db.activityLog.create({
        data: {
          userId: (session.user as { id: string }).id,
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
