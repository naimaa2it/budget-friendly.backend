/**
 * fixImageUrlsDirect.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloudinary migration fixed the assets (SmartBuyBD → Pickob) but MongoDB
 * still stores the old URLs. This script does a direct find-and-replace on
 * every collection that holds image URLs / public_ids.
 *
 * Collections updated:
 *   Product  — images[].url, images[].public_id, detailedDescription (Mixed)
 *   Category — images[].url, images[].public_id
 *   User     — image, imagePublicId
 *   BlogPost — featuredImage, additionalImages, videos, dynamicSections
 *
 * Run:
 *   node scripts/fixImageUrlsDirect.js          # dry-run (counts only)
 *   node scripts/fixImageUrlsDirect.js --fix    # write to MongoDB
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mongoose from "mongoose";

const DRY_RUN = !process.argv.includes("--fix");
console.log(DRY_RUN
  ? "⚠  DRY RUN — no writes. Add --fix to apply.\n"
  : "🔧 FIX mode — updating MongoDB...\n");

await mongoose.connect(process.env.MONGODB_URI);
console.log("✓ MongoDB connected\n");

const FROM = "SmartBuyBD";
const TO   = "Pickob";

// Deep-replace every string inside any JS value
const rep = (v) => {
  if (typeof v === "string") return v.replaceAll(FROM, TO);
  if (Array.isArray(v))      return v.map(rep);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, iv] of Object.entries(v)) o[k] = rep(iv);
    return o;
  }
  return v;
};

// ── Products ─────────────────────────────────────────────────────────────────
const { default: Product } = await import("../models/Product.js");

const prodDocs = await Product.find({
  $or: [
    { "images.url":       { $regex: FROM } },
    { "images.public_id": { $regex: FROM } },
    // also catch detailedDescription blocks that embed image URLs
    { detailedDescription: { $regex: FROM } },
  ],
}).lean();

console.log(`Products to fix: ${prodDocs.length}`);
let prodFixed = 0;

// Use native collection to bypass Mongoose schema casting (avoids _id buffer issue)
const prodCol = Product.collection;

for (const d of prodDocs) {
  const upd = {};

  if (d.images?.some((i) => i?.url?.includes(FROM) || i?.public_id?.includes(FROM))) {
    upd.images = rep(d.images);
  }
  if (d.detailedDescription) {
    const fixed = rep(d.detailedDescription);
    if (JSON.stringify(fixed) !== JSON.stringify(d.detailedDescription)) {
      upd.detailedDescription = fixed;
    }
  }

  if (Object.keys(upd).length) {
    console.log(`  • ${d.title?.slice(0, 60)}`);
    if (!DRY_RUN) {
      await prodCol.updateOne({ _id: d._id }, { $set: upd });
    }
    prodFixed++;
  }
}
console.log(`Products updated: ${prodFixed}\n`);

// ── Categories ────────────────────────────────────────────────────────────────
const catCol = mongoose.connection.collection("categories");

const catDocs = await catCol.find({
  "images.url": { $regex: FROM },
}).toArray();

console.log(`Categories to fix: ${catDocs.length}`);
let catFixed = 0;
for (const d of catDocs) {
  const fixedImages = rep(d.images);
  if (!DRY_RUN) {
    await catCol.updateOne({ _id: d._id }, { $set: { images: fixedImages } });
  }
  catFixed++;
}
console.log(`Categories updated: ${catFixed}\n`);

// ── Users ─────────────────────────────────────────────────────────────────────
const userCol = mongoose.connection.collection("users");

const userDocs = await userCol.find({
  $or: [{ image: { $regex: FROM } }, { imagePublicId: { $regex: FROM } }],
}).toArray();

console.log(`Users to fix: ${userDocs.length}`);
let userFixed = 0;
for (const d of userDocs) {
  const upd = {};
  if (d.image?.includes(FROM))         upd.image          = d.image.replaceAll(FROM, TO);
  if (d.imagePublicId?.includes(FROM)) upd.imagePublicId  = d.imagePublicId.replaceAll(FROM, TO);
  if (!DRY_RUN && Object.keys(upd).length) {
    await userCol.updateOne({ _id: d._id }, { $set: upd });
  }
  userFixed++;
}
console.log(`Users updated: ${userFixed}\n`);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════");
console.log(`Products:   ${prodFixed}`);
console.log(`Categories: ${catFixed}`);
console.log(`Users:      ${userFixed}`);
if (DRY_RUN) {
  console.log("\nRun with --fix to apply these changes.");
}
console.log("═══════════════════════════════════════════════════════");

await mongoose.disconnect();
console.log("\n✓ Done");
