import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const tursoUrl = process.env.TURSO_DATABASE_URL || "libsql://scorewise-tisonek.aws-us-east-2.turso.io";
const authToken = process.env.TURSO_AUTH_TOKEN;
const libsql = createClient({ url: tursoUrl, authToken });

const adapter = new PrismaLibSQL(libsql);
const db = new PrismaClient({ adapter });

async function main() {
  // Check if admin already exists
  const existingAdmin = await db.user.findUnique({ where: { email: "admin@scorewise.com" } });
  if (existingAdmin) {
    console.log("Admin user already exists — seeding skipped");
    return;
  }

  const passwordHash = await bcrypt.hash("admin123", 10);
  const userPasswordHash = await bcrypt.hash("user123", 10);

  const admin = await db.user.create({
    data: {
      email: "admin@scorewise.com",
      name: "Admin",
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log(`✓ Created admin: ${admin.email} / admin123`);

  const user = await db.user.create({
    data: {
      email: "user@scorewise.com",
      name: "Demo User",
      passwordHash: userPasswordHash,
      role: "USER",
    },
  });
  console.log(`✓ Created user: ${user.email} / user123`);

  console.log("\n✅ Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
