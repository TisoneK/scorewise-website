import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "libsql://scorewise-tisonek.aws-us-east-2.turso.io";
const authToken = process.env.TURSO_AUTH_TOKEN;

const turso = createClient({ url, authToken });

async function main() {
  // Check if admin exists
  const existing = await turso.execute("SELECT id FROM User WHERE email = 'admin@scorewise.com'");
  if (existing.rows.length > 0) {
    console.log("Admin user already exists — seeding skipped");
    return;
  }

  // Insert admin with pre-generated bcrypt hash (admin123)
  await turso.execute({
    sql: `INSERT INTO User (id, email, name, "passwordHash", role, "createdAt", "updatedAt") 
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: ["admin-1", "admin@scorewise.com", "Admin", "$2b$10$w5LiFWNd0n3t7uZ8A9So6eZEUB2TyNGdNu/TaZWgox6xkrxwpFHM2", "ADMIN"],
  });
  console.log("✓ Created admin: admin@scorewise.com / admin123");

  // Insert user with pre-generated bcrypt hash (user123)
  await turso.execute({
    sql: `INSERT INTO User (id, email, name, "passwordHash", role, "createdAt", "updatedAt") 
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: ["user-1", "user@scorewise.com", "Demo User", "$2b$10$zyGXUegLrOtZpNQy1zuKLeeX5xTgCPB8PaXandkaRLDcFsJ5Jqvq6", "USER"],
  });
  console.log("✓ Created user: user@scorewise.com / user123");

  console.log("\n✅ Database seeded successfully!");
}

main().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
