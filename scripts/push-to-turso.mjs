import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL || "libsql://scorewise-tisonek.aws-us-east-2.turso.io";
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!authToken) {
  console.error("TURSO_AUTH_TOKEN environment variable is required");
  process.exit(1);
}

const turso = createClient({ url, authToken });

const sql = `
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "ServiceConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "service" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "service" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL DEFAULT '',
    "awayTeam" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "league" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "time" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT 'FULL_MATCH',
    "success" BOOLEAN NOT NULL DEFAULT true,
    "validationErrors" TEXT NOT NULL DEFAULT '[]',
    "recommendation" TEXT,
    "teamWinner" TEXT,
    "recommendationConfidence" TEXT,
    "teamWinnerConfidence" TEXT,
    "confidence" TEXT,
    "bookmakerLine" REAL,
    "overOdds" REAL,
    "underOdds" REAL,
    "homeOdds" REAL,
    "awayOdds" REAL,
    "averageRate" REAL NOT NULL DEFAULT 0,
    "matchesAbove" INTEGER NOT NULL DEFAULT 0,
    "matchesBelow" INTEGER NOT NULL DEFAULT 0,
    "decrementTest" INTEGER NOT NULL DEFAULT 0,
    "incrementTest" INTEGER NOT NULL DEFAULT 0,
    "h2hTotals" TEXT NOT NULL DEFAULT '[]',
    "rateValues" TEXT NOT NULL DEFAULT '[]',
    "winningStreakData" TEXT,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceConfig_service_key_key" ON "ServiceConfig"("service", "key");
CREATE UNIQUE INDEX IF NOT EXISTS "Prediction_matchId_key" ON "Prediction"("matchId");
`;

const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const stmt of statements) {
  try {
    await turso.execute(stmt + ";");
    console.log(`✓ Executed: ${stmt.slice(0, 60)}...`);
  } catch (err) {
    console.error(`✗ Failed: ${stmt.slice(0, 60)}...`);
    console.error(`  ${err.message}`);
  }
}

console.log("\n✅ Schema push complete!");
process.exit(0);
