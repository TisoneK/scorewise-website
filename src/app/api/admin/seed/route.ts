import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// POST /api/admin/seed — Seed the database with a default admin and user
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const secret = body.secret;

    // Simple guard to prevent accidental seeding
    if (secret !== "scorewise-seed-2024") {
      return NextResponse.json({ error: "Invalid seed secret" }, { status: 403 });
    }

    // Check if admin already exists
    const existingAdmin = await db.user.findUnique({ where: { email: "admin@scorewise.com" } });
    if (existingAdmin) {
      return NextResponse.json({ message: "Admin user already exists" }, { status: 200 });
    }

    const passwordHash = await bcrypt.hash("admin123", 10);
    const userPasswordHash = await bcrypt.hash("user123", 10);

    const admin = await db.user.create({
      data: {
        email: "admin@scorewise.com",
        name: "Admin",
        passwordHash,
        role: "ADMIN",
      },
    });

    const user = await db.user.create({
      data: {
        email: "user@scorewise.com",
        name: "Demo User",
        passwordHash: userPasswordHash,
        role: "USER",
      },
    });

    return NextResponse.json({
      message: "Database seeded successfully",
      users: [
        { email: admin.email, role: admin.role, password: "admin123" },
        { email: user.email, role: user.role, password: "user123" },
      ],
    });
  } catch (error) {
    console.error("[seed] Error:", error);
    return NextResponse.json({ error: "Seeding failed" }, { status: 500 });
  }
}
