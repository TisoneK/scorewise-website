import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db-libsql";

// POST /api/admin/seed — Seed the database with a default admin
// Requires admin auth OR a one-time BOOTSTRAP_SECRET env var for first-run setup
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = await getServerSession(authOptions);

    const isAdmin = session && (session.user as { role: string })?.role === "ADMIN";
    const envSecret = process.env.BOOTSTRAP_SECRET;
    const isBootstrap = envSecret && body.bootstrapSecret === envSecret;

    if (!isAdmin && !isBootstrap) {
      return NextResponse.json({ error: "Unauthorized — admin access or BOOTSTRAP_SECRET required" }, { status: 401 });
    }

    // Check if admin already exists
    const existingAdmin = await db.user.findUnique({ where: { email: "admin@scorewise.com" } });
    if (existingAdmin) {
      return NextResponse.json({ message: "Admin user already exists" }, { status: 200 });
    }

    // Generate a random secure password for the initial admin
    const randomPassword = crypto.randomUUID().slice(0, 16);
    const passwordHash = await bcrypt.hash(randomPassword, 10);

    const admin = await db.user.create({
      data: {
        email: "admin@scorewise.com",
        name: "Admin",
        passwordHash,
        role: "ADMIN",
      },
    });

    // Log the action (only when authenticated as admin, not bootstrap)
    if (session) await db.activityLog.create({
      data: {
        userId: (session.user as { id: string }).id,
        action: "USER_CREATE",
        service: "website",
        details: JSON.stringify({ createdEmail: admin.email, createdRole: "ADMIN", method: "seed" }),
      },
    });

    return NextResponse.json({
      message: "Database seeded successfully",
      user: { email: admin.email, role: admin.role },
      generatedPassword: randomPassword,
      warning: "Save this password now. It will not be shown again.",
    });
  } catch (error) {
    console.error("[seed] Error:", error);
    return NextResponse.json({ error: "Seeding failed" }, { status: 500 });
  }
}
