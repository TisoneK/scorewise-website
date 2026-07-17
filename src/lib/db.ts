import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const isProduction = process.env.NODE_ENV === 'production'
  const logLevel: ('error' | 'query')[] = isProduction ? ['error'] : ['query']

  // Turso / LibSQL adapter for Vercel serverless
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    // PrismaLibSQL is a factory that takes a Config object (url + authToken)
    // and creates the libsql client internally — do NOT pass a Client instance
    const adapter = new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    return new PrismaClient({ adapter, log: logLevel })
  }

  // Local development: use standard SQLite
  return new PrismaClient({ log: logLevel })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
