/**
 * finalStatus.js — final report after all fixes
 * Shows which products still have broken images (need re-upload)
 * vs which are now working.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import https from "https";

await mongoose.connect(process.env.MONGODB_URI);
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Build Cloudinary URL map
const urlMap = new Map();
const fetchFolder = async (prefix) => {
  let cursor;
  do {
    const r = await cloudinary.api.resources({
      type: "upload", resource_type: "image",
      prefix, max_results: 500,
      ...(cursor ? { next_cursor: cursor } : {}),
    });
    for (const a of r.resources || []) urlMap.set(a.public_id, a.secure_url);
    cursor = r.next_cursor;
  } while (cursor);
};
await fetchFolder("Pickob/media/");
await fetchFolder("Pickob/products/");

const checkUrl = (url) => new Promise((resolve) => {
  if (!url || !url.startsWith("http")) return resolve(0);
  const lib = https;
  const req = lib.request(url, { method: "HEAD" }, (r) => resolve(r.statusCode));
  req.on("error", () => resolve(0));
  req.setTimeout(6000, () => { req.destroy(); resolve(0); });
  req.end();
});

const col = mongoose.connection.collection("products");
const all = await col.find({ status: "published" }, { title: 1, images: 1 }).toArray();

const working = [];
const partiallyBroken = [];
const fullyBroken = [];
const noImages = [];

for (const p of all) {
  if (!p.images?.length) { noImages.push(p.title); continue; }

  let ok = 0, broken = 0;
  for (const img of p.images) {
    // Check if this public_id exists in Cloudinary map
    if (!img.public_id) { broken++; continue; }
    const inCloudinary = urlMap.has(img.public_id);
    if (inCloudinary) ok++;
    else broken++;
  }

  if (broken === 0) working.push(p.title);
  else if (ok > 0) partiallyBroken.push({ title: p.title, ok, broken });
  else fullyBroken.push(p.title);
}

console.log("═══════════════════════════════════════════════════════");
console.log(`✅ All images OK:            ${working.length} products`);
console.log(`⚠️  Some images missing:      ${partiallyBroken.length} products`);
console.log(`❌ All images permanently lost: ${fullyBroken.length} products`);
console.log(`📭 No images at all:          ${noImages.length} products`);
console.log("═══════════════════════════════════════════════════════\n");

if (fullyBroken.length) {
  console.log("❌ Products needing FULL re-upload:");
  fullyBroken.forEach((t) => console.log(`   • ${t}`));
  console.log();
}

if (partiallyBroken.length) {
  console.log("⚠️  Products with PARTIAL images (some missing):");
  partiallyBroken.forEach(({ title, ok, broken }) =>
    console.log(`   • ${title.slice(0, 60)}  [${ok} ok / ${broken} missing]`));
  console.log();
}

if (noImages.length) {
  console.log("📭 Products with NO images:");
  noImages.forEach((t) => console.log(`   • ${t}`));
}

await mongoose.disconnect();
console.log("\n✓ Done");
