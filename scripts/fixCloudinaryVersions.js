/**
 * fixCloudinaryVersions.js
 * ─────────────────────────────────────────────────────────────────────────────
 * After a Cloudinary folder rename (SmartBuyBD → Pickob), the version number
 * in all image URLs is stale. Cloudinary returns 404 for URLs with old version.
 *
 * This script:
 *   1. Fetches every asset currently in Pickob/media/ from Cloudinary API
 *      (gets the fresh, correct secure_url for each public_id)
 *   2. Builds a lookup map:  public_id → correct_url
 *   3. For every product image whose public_id exists in the map,
 *      replaces the stored URL with the correct URL from Cloudinary
 *
 * Run:
 *   node scripts/fixCloudinaryVersions.js          # dry-run
 *   node scripts/fixCloudinaryVersions.js --fix    # write to MongoDB
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

const DRY_RUN = !process.argv.includes("--fix");
console.log(DRY_RUN
  ? "⚠  DRY RUN — no writes. Add --fix to apply.\n"
  : "🔧 FIX mode — updating MongoDB...\n");

// ── connect ───────────────────────────────────────────────────────────────────
await mongoose.connect(process.env.MONGODB_URI);
console.log("✓ MongoDB connected");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Step 1: fetch ALL assets from Pickob/media/ ───────────────────────────────
console.log("\nFetching assets from Cloudinary Pickob/media/ ...");
const urlMap = new Map(); // public_id → secure_url

const fetchFolder = async (prefix) => {
  let cursor;
  let count = 0;
  do {
    const r = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix,
      max_results: 500,
      ...(cursor ? { next_cursor: cursor } : {}),
    });
    for (const a of r.resources || []) {
      urlMap.set(a.public_id, a.secure_url);
      count++;
    }
    cursor = r.next_cursor;
  } while (cursor);
  return count;
};

const mediaCount = await fetchFolder("Pickob/media/");
console.log(`  Pickob/media/    → ${mediaCount} assets loaded`);

// Also load Pickob/products/ just in case some ended up there
const prodCount = await fetchFolder("Pickob/products/");
console.log(`  Pickob/products/ → ${prodCount} assets loaded`);

console.log(`  Total URL map size: ${urlMap.size}\n`);

// ── Step 2: fix products ──────────────────────────────────────────────────────
const col = mongoose.connection.collection("products");

// Find products whose images have a Pickob/media public_id (already renamed in DB)
const products = await col.find({
  "images.public_id": { $regex: "Pickob/" },
}).toArray();

console.log(`Products with Pickob image public_ids: ${products.length}`);

let totalImagesFixed = 0;
let totalProductsFixed = 0;
let totalUnresolved = 0;

for (const p of products) {
  let changed = false;
  const newImages = (p.images || []).map((img) => {
    if (!img.public_id) return img;

    const freshUrl = urlMap.get(img.public_id);
    if (freshUrl && freshUrl !== img.url) {
      changed = true;
      totalImagesFixed++;
      return { ...img, url: freshUrl };
    }
    if (!freshUrl && img.public_id?.includes("Pickob/")) {
      totalUnresolved++;
    }
    return img;
  });

  if (changed) {
    console.log(`  ✔ ${p.title?.slice(0, 60)}`);
    if (!DRY_RUN) {
      await col.updateOne({ _id: p._id }, { $set: { images: newImages } });
    }
    totalProductsFixed++;
  }
}

// ── Step 3: fix categories ────────────────────────────────────────────────────
const catCol = mongoose.connection.collection("categories");
const cats = await catCol.find({ "images.public_id": { $regex: "Pickob/" } }).toArray();

let catFixed = 0;
for (const c of cats) {
  let changed = false;
  const newImages = (c.images || []).map((img) => {
    if (!img.public_id) return img;
    const freshUrl = urlMap.get(img.public_id);
    if (freshUrl && freshUrl !== img.url) {
      changed = true;
      return { ...img, url: freshUrl };
    }
    return img;
  });
  if (changed) {
    if (!DRY_RUN) {
      await catCol.updateOne({ _id: c._id }, { $set: { images: newImages } });
    }
    catFixed++;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════");
console.log(`Images fixed:          ${totalImagesFixed}`);
console.log(`Products updated:      ${totalProductsFixed}`);
console.log(`Categories updated:    ${catFixed}`);
if (totalUnresolved > 0) {
  console.log(`Images not in Cloudinary: ${totalUnresolved} (may be permanently lost)`);
}
if (DRY_RUN && totalProductsFixed > 0) {
  console.log("\nRun with --fix to apply these changes.");
}
console.log("═══════════════════════════════════════════════════════");

await mongoose.disconnect();
console.log("\n✓ Done");
