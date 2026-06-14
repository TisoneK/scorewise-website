import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url) {
    throw new Error('TURSO_DATABASE_URL or DATABASE_URL environment variable is not set')
  }

  if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN environment variable is not set')
  }

  // Turso / LibSQL adapter for Vercel serverless
  const libsql = createClient({ url, authToken })

  const adapter = new PrismaLibSQL(libsql)
  return new PrismaClient({ adapter, log: ['query'] })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
