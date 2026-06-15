import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/api/auth/signup", "/api/auth/_next", "/api/auth/callback", "/api/auth/session"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow NextAuth internal routes
  if (pathname.startsWith("/api/auth/") && !publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow public auth routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
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

  // If no token and trying to access protected routes, redirect to login
  // The login page is at "/" so unauthenticated users see it by default
  if (!token) {
    // For API routes, return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    // For page routes, redirect to home (which shows login form)
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
