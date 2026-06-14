import { createClient } from "@libsql/client";
import { createHash } from "crypto";

const url = process.env.TURSO_DATABASE_URL || "libsql://scorewise-tisonek.aws-us-east-2.turso.io";
const authToken = process.env.TURSO_AUTH_TOKEN;

const turso = createClient({ url, authToken });

// bcryptjs replacement using Node's crypto (simplified — for seed only)
function simpleHash(password, salt) {
  return createHash("sha256").update(password + salt).digest("hex");
}

async function main() {
  // Check if admin exists
  const existing = await turso.execute("SELECT id FROM User WHERE email = 'admin@scorewise.com'");
  if (existing.rows.length > 0) {
    console.log("Admin user already exists — seeding skipped");
    return;
  }

  // Create admin
  const adminHash = "$2a$10$" + simpleHash("admin123", "fixed_salt_admin");
  await turso.execute({
    sql: `INSERT INTO User (id, email, name, passwordHash, role, createdAt, updatedAt) 
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: ["admin-" + Date.now(), "admin@scorewise.com", "Admin", adminHash, "ADMIN"],
  });
  console.log("✓ Created admin: admin@scorewise.com / admin123");

  // Create user
  const userHash = "$2a$10$" + simpleHash("user123", "fixed_salt_user");
  await turso.execute({
    sql: `INSERT INTO User (id, email, name, passwordHash, role, createdAt, updatedAt) 
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: ["user-" + Date.now(), "user@scorewise.com", "Demo User", userHash, "USER"],
  });
  console.log("✓ Created user: user@scorewise.com / user123");

  console.log("\n✅ Database seeded successfully!");
}

main().catch((e) => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
