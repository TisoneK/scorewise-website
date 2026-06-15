import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db-libsql";

// POST /api/auth/signup — Public self-registration
// New users are always created with role "USER" (never ADMIN).
export async function POST(request: Request) {
  try {
    const { email, name, password } = await request.json();

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await db.user.create({
      data: {
        email,
        name: name || null,
        passwordHash,
        role: "USER", // Always USER — admins are created via admin panel only
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    return NextResponse.json(
      { message: "Account created successfully", user: { email: user.email, name: user.name } },
      { status: 201 }
    );
  } catch (error) {
    console.error("[auth/signup] Error:", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
