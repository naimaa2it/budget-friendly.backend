/**
 * One-time fix: update storeName from "YourHaat" (or any wrong value) to "Pickob"
 * in the Settings collection.
 *
 * Run: node scripts/fixStoreName.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("MONGODB_URI not set in .env");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("Connected to MongoDB");

const Setting = (await import("../models/Setting.js")).default;

const current = await Setting.findOne().lean();
if (!current) {
  console.log("No settings document found — creating with Pickob.");
  await Setting.create({ storeName: "Pickob" });
} else {
  console.log(`Current storeName: "${current.storeName}"`);
  if (current.storeName !== "Pickob") {
    await Setting.updateOne({}, { $set: { storeName: "Pickob" } });
    console.log('Updated storeName to "Pickob".');
  } else {
    console.log("storeName is already correct — no change needed.");
  }
}

await mongoose.disconnect();
console.log("Done.");
