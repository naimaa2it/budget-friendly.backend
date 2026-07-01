/**
 * checkImages.js
 * ───────────────────────────────────────────────────────────────
 * Diagnostic script — finds products with missing/broken images.
 *
 * Run:  node scripts/checkImages.js
 *
 * Reports:
 *  - Total products
 *  - Products with NO images in MongoDB
 *  - Products whose Cloudinary URLs return non-200 (broken)
 *  - Lists public_ids still present in Cloudinary (for recovery)
 * ───────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import https from "https";

const MONGO_URI = process.env.MONGODB_URI;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "Pickob";

// ── mongoose connection ───────────────────────────────────────
await mongoose.connect(MONGO_URI);
console.log("✓ MongoDB connected\n");

// ── cloudinary connection ─────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── helpers ───────────────────────────────────────────────────
const checkUrl = (url) =>
  new Promise((resolve) => {
    try {
      const req = https.request(url, { method: "HEAD" }, (res) => {
        resolve(res.statusCode);
      });
      req.on("error", () => resolve(0));
      req.setTimeout(8000, () => { req.destroy(); resolve(0); });
      req.end();
    } catch {
      resolve(0);
    }
  });

// ── load all products ─────────────────────────────────────────
const { default: Product } = await import("../models/Product.js");

const allProducts = await Product.find({}, "title slug images status").lean();
console.log(`Total products in MongoDB: ${allProducts.length}\n`);

// ── categorise ───────────────────────────────────────────────
const noImages       = [];   // images array is empty
const brokenImages   = [];   // images exist but URLs are broken (non-200)
const okProducts     = [];   // all images return 200

for (const p of allProducts) {
  if (!p.images || p.images.length === 0) {
    noImages.push({ id: p._id, title: p.title, status: p.status });
    continue;
  }

  let broken = false;
  for (const img of p.images) {
    if (!img.url) { broken = true; break; }
    const code = await checkUrl(img.url);
    if (code !== 200) { broken = true; break; }
  }

  if (broken) {
    brokenImages.push({
      id: p._id,
      title: p.title,
      status: p.status,
      images: p.images.map((i) => ({ url: i.url, public_id: i.public_id })),
    });
  } else {
    okProducts.push(p._id);
  }
}

// ── report ────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════");
console.log(`Products with NO images:      ${noImages.length}`);
console.log(`Products with BROKEN images:  ${brokenImages.length}`);
console.log(`Products with OK images:      ${okProducts.length}`);
console.log("═══════════════════════════════════════════════════════\n");

if (noImages.length > 0) {
  console.log("── Products with NO images ──────────────────────────");
  noImages.slice(0, 20).forEach((p) =>
    console.log(`  [${p.status}] ${p.title}  (${p.id})`),
  );
  if (noImages.length > 20) console.log(`  … and ${noImages.length - 20} more`);
  console.log();
}

if (brokenImages.length > 0) {
  console.log("── Products with BROKEN image URLs ──────────────────");
  brokenImages.slice(0, 20).forEach((p) => {
    console.log(`  [${p.status}] ${p.title}  (${p.id})`);
    p.images.forEach((i) =>
      console.log(`       url: ${i.url}`),
    );
  });
  if (brokenImages.length > 20) console.log(`  … and ${brokenImages.length - 20} more`);
  console.log();
}

// ── check what's actually in Cloudinary ──────────────────────
console.log(`── Cloudinary assets in "${CLOUDINARY_FOLDER}/products" folder ──`);
try {
  let cursor;
  let total = 0;
  do {
    const result = await cloudinary.api.resources({
      type:         "upload",
      resource_type: "image",
      prefix:       `${CLOUDINARY_FOLDER}/products/`,
      max_results:  500,
      ...(cursor ? { next_cursor: cursor } : {}),
    });
    total += (result.resources || []).length;
    cursor = result.next_cursor;
  } while (cursor);

  console.log(`  Total images in Cloudinary: ${total}`);
} catch (err) {
  console.error("  Could not fetch Cloudinary assets:", err.message);
}

console.log("\n✓ Done");
await mongoose.disconnect();
