import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client";

const seedClient = createClient({
  url: process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

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
    const existing = await seedClient.execute({
      sql: "SELECT id FROM User WHERE email = ?",
      args: ["admin@scorewise.com"],
    });
    if (existing.rows.length > 0) {
      return NextResponse.json({ message: "Admin user already exists" }, { status: 200 });
    }

    const passwordHash = await bcrypt.hash("admin123", 10);
    const userPasswordHash = await bcrypt.hash("user123", 10);

    const adminResult = await seedClient.execute({
      sql: "INSERT INTO User (id, email, name, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now')) RETURNING id, email, role",
      args: [
        crypto.randomUUID(),
        "admin@scorewise.com",
        "Admin",
        passwordHash,
        "ADMIN",
      ],
    });

    const userResult = await seedClient.execute({
      sql: "INSERT INTO User (id, email, name, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now')) RETURNING id, email, role",
      args: [
        crypto.randomUUID(),
        "user@scorewise.com",
        "Demo User",
        userPasswordHash,
        "USER",
      ],
    });

    const admin = adminResult.rows[0] as { id: string; email: string; role: string };
    const user = userResult.rows[0] as { id: string; email: string; role: string };

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
