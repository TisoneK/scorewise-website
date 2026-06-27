import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
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

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) return null;

        // Google-only users (no passwordHash) can't sign in with credentials
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
    // clientId/clientSecret must be set as GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
    // env vars in Vercel. If they're missing, the provider is silently omitted
    // so the app doesn't crash — credentials-only auth still works.
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
    // ── signIn callback — auto-create Google users on first sign-in ───
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const existing = await db.user.findUnique({
          where: { email: user.email },
        });
        if (!existing) {
          // First Google sign-in — create a USER account with no password
          await db.user.create({
            data: {
              email: user.email,
              name: user.name || undefined,
              role: "USER",
              // passwordHash stays null — this user authenticates via Google only
            },
          });
        }
      }
      return true;
    },
    // ── jwt callback — attach role + id from DB ───────────────────────
    // For CredentialsProvider, the user object already has role + id from authorize().
    // For GoogleProvider, the user object comes from Google's profile and has no role —
    // so we fetch it from our DB on first sign-in.
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          // Google sign-in: fetch role + id from our DB (Google profile doesn't include role)
          const dbUser = await db.user.findUnique({
            where: { email: user.email! },
          });
          if (dbUser) {
            token.role = dbUser.role;
            token.id = dbUser.id;
          }
        } else {
          // Credentials sign-in: user already has role + id from authorize()
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
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: nextAuthSecret,
};
