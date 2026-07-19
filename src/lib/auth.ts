import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@/lib/db-libsql";

// Warn if NEXTAUTH_SECRET is not set — tokens will use a fallback secret
// In production, always set NEXTAUTH_SECRET in your hosting environment
const nextAuthSecret = process.env.NEXTAUTH_SECRET || "scorewise-fallback-secret-2024";
if (!process.env.NEXTAUTH_SECRET && process.env.NODE_ENV === "production") {
  console.warn("⚠️ NEXTAUTH_SECRET is not set. Using fallback secret — set NEXTAUTH_SECRET in your deployment environment for security.");
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // A thrown error here redirects the user to the auth ERROR flow
        // (dead zone); returning null keeps them on the login page with a
        // "sign in failed" message. A transient DB hiccup must be the
        // second, never the first.
        let user;
        try {
          user = await db.user.findUnique({
            where: { email: credentials.email },
          });
        } catch (e) {
          console.error("[auth/authorize] DB lookup failed:", e);
          return null;
        }

        if (!user) return null;
        if (!user.passwordHash) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    // ── Google OAuth ──────────────────────────────────────────────────
    // Auto-creates a user on first Google sign-in (no separate signup step).
    // Google users get a random unguessable placeholder passwordHash — they
    // can never log in via credentials (bcrypt.compare will always fail).
    // This avoids needing a schema migration (passwordHash stays NOT NULL).
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          authorization: {
            params: {
              prompt: "consent",
              access_type: "offline",
              response_type: "code",
            },
          },
        })]
      : []),
  ],
  callbacks: {
    // ── signIn callback — auto-create Google users, then log the login ──
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        // A throw here sends the user to the auth ERROR flow (dead zone);
        // returning false keeps them on the login page with an error
        // message. A transient DB hiccup must never hard-strand them.
        try {
          const existing = await db.user.findUnique({
            where: { email: user.email },
          });
          if (!existing) {
            // Generate a random password that no one will ever know.
            // Hash it with bcrypt so the DB column constraint (NOT NULL) is
            // satisfied. Google users authenticate via OAuth, never credentials.
            const randomPassword = crypto.randomUUID() + crypto.randomUUID() + crypto.randomUUID();
            const placeholderHash = await bcrypt.hash(randomPassword, 12);
            await db.user.create({
              data: {
                email: user.email,
                name: user.name || undefined,
                role: "USER",
                passwordHash: placeholderHash,
              },
            });
          }
        } catch (e) {
          console.error("[auth/signIn] Google auto-create failed:", e);
          return false;
        }
      }
      // ── Record login event ─────────────────────────────────────────
      // Track every successful sign-in for user activity analytics.
      if (user.email) {
        try {
          const existing = await db.user.findUnique({ where: { email: user.email } });
          if (existing) {
            // Log the login event
            await db.activityLog.create({
              data: {
                userId: existing.id,
                action: "USER_LOGIN",
                service: "website",
                details: JSON.stringify({
                  provider: account?.provider || "credentials",
                  email: user.email,
                  login_at: new Date().toISOString(),
                }),
              },
            });
          }
        } catch {
          // Don't block login if logging fails
        }
      }
      return true;
    },
    // ── jwt callback — attach role + id from DB ───────────────────────
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          // Guarded: a throw here also ends in the auth error flow. On a
          // DB hiccup the token keeps default (no-role) claims — the user
          // gets a degraded USER session instead of a dead end.
          try {
            const dbUser = await db.user.findUnique({
              where: { email: user.email! },
            });
            if (dbUser) {
              token.role = dbUser.role;
              token.id = dbUser.id;
            }
          } catch (e) {
            console.error("[auth/jwt] DB lookup failed:", e);
          }
        } else {
          token.role = (user as unknown as { role: string }).role;
          token.id = (user as unknown as { id: string }).id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role: string }).role = token.role as string;
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    signOut: "/",
    // CRITICAL: without this, any auth-flow error (e.g. a DB hiccup making
    // authorize()/callbacks throw) dumps users on NextAuth's default
    // /api/auth/error — a bare dead-end page with no way back (the
    // 2026-07-18 "site died" dead zone). Route errors to the login page,
    // which renders fine even when the DB is down.
    error: "/",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: nextAuthSecret,
};
