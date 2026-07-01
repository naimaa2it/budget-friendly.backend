/**
 * verifyFix.js — quick check after fixImageUrlsDirect.js
 * Shows current image URLs for the first 5 broken products.
 * Also tests one URL to confirm Cloudinary delivers it.
 */
import "dotenv/config";
import mongoose from "mongoose";
import https from "https";

await mongoose.connect(process.env.MONGODB_URI);
const col = mongoose.connection.collection("products");

// Check how many still have SmartBuyBD
const stillBroken = await col.countDocuments({ "images.url": { $regex: "SmartBuyBD" } });
const nowPickob   = await col.countDocuments({ "images.url": { $regex: "Pickob/media" } });

console.log(`MongoDB — still has SmartBuyBD URLs: ${stillBroken}`);
console.log(`MongoDB — has Pickob/media URLs:      ${nowPickob}\n`);

// Show first 3 products with Pickob/media URLs to confirm they look right
const samples = await col.find({ "images.url": { $regex: "Pickob/media" } }).limit(3).toArray();
for (const p of samples) {
  console.log(`Product: ${p.title?.slice(0, 50)}`);
  for (const img of (p.images || []).slice(0, 2)) {
    console.log(`  URL: ${img.url}`);
  }
}

// Live HTTP test on the first Pickob/media URL found
const firstUrl = samples[0]?.images?.[0]?.url;
if (firstUrl) {
  console.log(`\nTesting URL live: ${firstUrl}`);
  const status = await new Promise((resolve) => {
    const req = https.request(firstUrl, { method: "HEAD" }, (r) => resolve(r.statusCode));
    req.on("error", () => resolve(0));
    req.setTimeout(8000, () => { req.destroy(); resolve(0); });
    req.end();
  });
  console.log(`HTTP status: ${status} ${status === 200 ? "✓ OK" : "✗ BROKEN"}`);
}

await mongoose.disconnect();
