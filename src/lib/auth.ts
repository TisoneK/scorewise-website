import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client";

// Direct libsql client for auth — bypasses Prisma engine startup issues on Vercel
const authClient = createClient({
  url: process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

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

        const result = await authClient.execute({
          sql: "SELECT id, email, name, passwordHash, role FROM User WHERE email = ?",
          args: [credentials.email],
        });

        const row = result.rows[0] as
          | { id: string; email: string; name: string | null; passwordHash: string; role: string }
          | undefined;

        if (!row) return null;

        const isValid = await bcrypt.compare(credentials.password, row.passwordHash);
        if (!isValid) return null;

        return {
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id;
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
  secret: process.env.NEXTAUTH_SECRET || "scorewise-dev-secret-change-in-production",
};
