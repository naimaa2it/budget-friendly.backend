/**
 * seedAdmin.js
 * Creates (or updates) a single HIDDEN admin account.
 *
 * This admin is fully functional for login but is NEVER shown in the
 * dashboard's Admins management list, because it is flagged `isSecret: true`
 * (see the `isSecret: { $ne: true }` filter in routes/admin.js).
 *
 * Does NOT touch products, categories, orders, or any other collection.
 *
 * Usage:
 *   node seedAdmin.js
 *   node seedAdmin.js you@example.com yourStrongPassword "Your Name"
 *
 * Or via env:
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=xxxx node seedAdmin.js
 */

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
dotenv.config();

const SALT_ROUNDS = 12; // matches routes/admin.js

async function main() {
  // ── Credentials (CLI args > env > defaults) ───────────────────────────────
  const email = (
    process.argv[2] ||
    process.env.SEED_ADMIN_EMAIL ||
    "owner@pickob.com"
  )
    .trim()
    .toLowerCase();
  const password =
    process.argv[3] || process.env.SEED_ADMIN_PASSWORD || "ChangeMe@12345";
  const name = process.argv[4] || process.env.SEED_ADMIN_NAME || "Owner";

  // ── Connect ───────────────────────────────────────────────────────────────
  const URI =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://localhost:27017/Pickob";
  await mongoose.connect(URI);
  console.log("Connected to MongoDB");

  const Admin = (await import("./models/Admin.js")).default;

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  // ── Upsert the hidden admin ───────────────────────────────────────────────
  const existing = await Admin.findOne({ email });
  if (existing) {
    existing.name = name;
    existing.hashedPassword = hashedPassword;
    existing.role = "admin";
    existing.isSecret = true; // stay hidden from dashboard
    existing.isActive = true;
    existing.isLocked = false;
    existing.lockUntil = undefined;
    existing.loginAttempts = 0;
    await existing.save();
    console.log(`♻️  Updated existing hidden admin: ${email}`);
  } else {
    await Admin.create({
      name,
      email,
      hashedPassword,
      role: "admin",
      isSecret: true, // hidden from the Admins management list
      isActive: true,
    });
    console.log(`✅ Created hidden admin: ${email}`);
  }

  console.log("\n──────────── LOGIN CREDENTIALS ────────────");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log("  (This admin will NOT appear in the dashboard admin list.)");
  console.log("───────────────────────────────────────────\n");

  await mongoose.disconnect();
  console.log("Done — hidden admin seeded successfully.");
}

main().catch((err) => {
  console.error("SEED ERROR", err);
  process.exit(1);
});
