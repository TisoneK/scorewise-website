import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const isProduction = process.env.NODE_ENV === 'production'
  const logLevel = isProduction ? ['error'] : ['query']

  // Use Turso (LibSQL) adapter in production (Vercel), local SQLite in development
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    // Dynamic imports to avoid bundling Turso deps in development
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@libsql/client')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibSQL } = require('@prisma/adapter-libsql')

    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })

    const adapter = new PrismaLibSQL(libsql)
    return new PrismaClient({ adapter, log: logLevel })
  }

  // Local development: use standard SQLite
  return new PrismaClient({ log: logLevel })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
