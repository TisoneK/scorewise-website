import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Pages that don't require authentication (login/signup are at root "/")
const publicPaths = ["/"];

// API routes that don't require authentication
const publicApiPrefixes = ["/api/auth/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow all NextAuth API routes (login, callback, session, etc.)
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
    secret: process.env.NEXTAUTH_SECRET,
  });

  // If no token, block access
  if (!token) {
    // For API routes, return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    // For page routes, redirect to login page
    return NextResponse.redirect(new URL("/", request.url));
  }

  // For admin-only API routes, check role
  if (pathname.startsWith("/api/admin/")) {
    const role = token.role as string;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
