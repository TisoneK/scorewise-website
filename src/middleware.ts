import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Pages that don't require authentication (login/signup are at root "/")
const publicPaths = ["/"];

// API routes that don't require authentication
// /api/admin/seed is allowed through so it can check if zero admins exist (first-run bootstrap)
// /api/webhook/ — engine POSTs HMAC-signed webhooks here (no session cookie).
//   Authenticity is verified via X-ScoreWise-Signature inside the route handler.
// /api/predictions/exists — scraper polls this to skip already-scraped matches.
//   Returns ONLY match_id strings (no prediction data), so it's safe to expose.
const publicApiPrefixes = [
  "/api/auth/",
  "/api/debug",
  "/api/admin/seed",
  "/api/webhook/",
  "/api/predictions/exists",
  "/api/cron", // Vercel cron jobs — auth via CRON_SECRET (checked inside the route)
  "/api/cron/", // also match with trailing slash
];

// Role hierarchy: ADMIN > OPERATOR > USER
// API route access levels
const adminOnlyPrefixes = ["/api/admin/config", "/api/admin/seed", "/api/admin/logs"];
const operatorAndAbovePrefixes = [
  "/api/admin/users",
  "/api/admin/scraper",
  "/api/admin/engine",
  "/api/admin/predictions", // bet-code setting — admins + operators (not regular users)
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow all public API routes (login, callback, session, etc.)
  if (publicApiPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Allow public pages (root "/" is the login page)
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Check for JWT token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || "scorewise-fallback-secret-2024",
  });

  // If no token, block access
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  const role = token.role as string;

  // Admin-only routes (config, seed, logs)
  if (adminOnlyPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
  }

  // Operator and above routes (user management, scraper controls)
  if (operatorAndAbovePrefixes.some((prefix) => pathname.startsWith(prefix))) {
    if (role !== "ADMIN" && role !== "OPERATOR") {
      return NextResponse.json({ error: "Operator access or above required" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
