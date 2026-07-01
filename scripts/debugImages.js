/**
 * debugImages.js — shows exactly what public_ids MongoDB has vs Cloudinary
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
console.log(`Cloudinary URL map: ${urlMap.size} assets\n`);

// Check one specific Cloudinary URL live
const testUrl = async (url) => new Promise((resolve) => {
  const req = https.request(url, { method: "HEAD" }, (r) => resolve(r.statusCode));
  req.on("error", () => resolve(0));
  req.setTimeout(8000, () => { req.destroy(); resolve(0); });
  req.end();
});

// Get first 3 products with broken Pickob/media images
const col = mongoose.connection.collection("products");
const products = await col.find({ "images.url": { $regex: "Pickob/media" } }).limit(3).toArray();

for (const p of products.slice(0, 2)) {
  console.log(`\nProduct: ${p.title?.slice(0, 60)}`);
  for (const img of (p.images || []).slice(0, 2)) {
    console.log(`  MongoDB public_id : ${img.public_id}`);
    console.log(`  MongoDB url       : ${img.url}`);

    const freshUrl = urlMap.get(img.public_id);
    console.log(`  Cloudinary URL    : ${freshUrl || "(NOT IN MAP)"}`);
    console.log(`  URLs match?       : ${freshUrl === img.url}`);

    // Test both URLs
    const mongoStatus = await testUrl(img.url);
    console.log(`  MongoDB URL status: ${mongoStatus}`);
    if (freshUrl && freshUrl !== img.url) {
      const freshStatus = await testUrl(freshUrl);
      console.log(`  Cloudinary status : ${freshStatus}`);
    }

    // Try without version number
    const noVersion = img.url?.replace(/\/v\d+\//, "/");
    if (noVersion !== img.url) {
      const noVerStatus = await testUrl(noVersion);
      console.log(`  No-version URL    : ${noVersion}`);
      console.log(`  No-version status : ${noVerStatus}`);
    }
  }
}

// Show a few Cloudinary assets to see what IDs they actually have
console.log("\n── First 5 Cloudinary public_ids in Pickob/media/ ──────");
let count = 0;
for (const [pid, url] of urlMap.entries()) {
  if (pid.startsWith("Pickob/media/")) {
    console.log(`  ${pid}`);
    console.log(`  → ${url}`);
    if (++count >= 5) break;
  }
}

await mongoose.disconnect();
