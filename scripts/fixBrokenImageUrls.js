/**
 * fixBrokenImageUrls.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Recovery script for products whose image URLs still point to the old
 * "SmartBuyBD" Cloudinary folder (and possibly "yourhaat") after the folder
 * was renamed to "Pickob".
 *
 * Strategy per broken image URL:
 *   1. Try the URL with "SmartBuyBD" → "Pickob" substitution
 *      (covers SmartBuyBD/media/ → Pickob/media/)
 *   2. Try the URL with "SmartBuyBD/media/" → "Pickob/products/" substitution
 *      (covers uploads that were moved to the products sub-folder)
 *   3. Try the URL with "yourhaat/" → "Pickob/products/" substitution
 *   4. If none work, skip and report
 *
 * Run:
 *   node scripts/fixBrokenImageUrls.js           # dry-run (no DB writes)
 *   node scripts/fixBrokenImageUrls.js --fix     # actually update MongoDB
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import mongoose from "mongoose";
import https from "https";
import http from "http";

const DRY_RUN = !process.argv.includes("--fix");
if (DRY_RUN) {
  console.log("⚠  DRY RUN mode — no DB changes will be made.");
  console.log("   Run with --fix to apply changes.\n");
} else {
  console.log("🔧 FIX mode — MongoDB will be updated.\n");
}

// ── connect ───────────────────────────────────────────────────────────────────
await mongoose.connect(process.env.MONGODB_URI);
console.log("✓ MongoDB connected\n");

// ── helpers ───────────────────────────────────────────────────────────────────
const checkUrl = (url) =>
  new Promise((resolve) => {
    try {
      const lib = url.startsWith("https") ? https : http;
      const req = lib.request(url, { method: "HEAD" }, (res) => {
        resolve(res.statusCode);
      });
      req.on("error", () => resolve(0));
      req.setTimeout(8000, () => { req.destroy(); resolve(0); });
      req.end();
    } catch {
      resolve(0);
    }
  });

const candidates = (url) => {
  const alts = [];
  if (url.includes("SmartBuyBD")) {
    // Try SmartBuyBD → Pickob (keeps sub-path)
    alts.push(url.replaceAll("SmartBuyBD", "Pickob"));
    // Try SmartBuyBD/media/ → Pickob/products/
    if (url.includes("SmartBuyBD/media/")) {
      alts.push(url.replace("SmartBuyBD/media/", "Pickob/products/"));
    }
  }
  if (url.includes("yourhaat/")) {
    alts.push(url.replace(/yourhaat\/[^/]+\//, "Pickob/products/"));
  }
  return alts;
};

// Derive public_id from a Cloudinary URL
// e.g. https://res.cloudinary.com/cloud/image/upload/v123/folder/id.webp → folder/id
const publicIdFromUrl = (url) => {
  try {
    const u = new URL(url);
    // path: /cloud/image/upload/v123/folder/id.ext  OR  /cloud/image/upload/folder/id.ext
    const parts = u.pathname.split("/");
    // drop leading empty, cloud_name, "image", "upload"
    const uploadIdx = parts.indexOf("upload");
    if (uploadIdx < 0) return null;
    const rest = parts.slice(uploadIdx + 1);
    // skip version segment (starts with "v" followed by digits)
    const noVer = rest[0]?.match(/^v\d+$/) ? rest.slice(1) : rest;
    const withExt = noVer.join("/");
    return withExt.replace(/\.[^.]+$/, ""); // strip extension
  } catch {
    return null;
  }
};

// ── load products ─────────────────────────────────────────────────────────────
const { default: Product } = await import("../models/Product.js");

const products = await Product.find(
  {
    $or: [
      { "images.url": { $regex: "SmartBuyBD" } },
      { "images.url": { $regex: "yourhaat" } },
      { "images.url": { $regex: "picsum" } },
    ],
  },
  "title images",
).lean();

console.log(`Found ${products.length} products with old/external image URLs.\n`);

// ── process each product ───────────────────────────────────────────────────────
let totalFixed = 0;
let totalUnresolvable = 0;

for (const prod of products) {
  let changed = false;
  const newImages = [];

  for (const img of prod.images) {
    const url = img.url || "";
    const isBroken =
      url.includes("SmartBuyBD") ||
      url.includes("yourhaat") ||
      url.includes("picsum.photos");

    if (!isBroken) {
      // URL looks fine, keep as-is
      newImages.push(img);
      continue;
    }

    // Check if the current URL still works
    const currentStatus = await checkUrl(url);
    if (currentStatus === 200) {
      // Still accessible even though it has old path — keep it
      console.log(`  ✓ Still works (${currentStatus}): ${url.slice(0, 80)}`);
      newImages.push(img);
      continue;
    }

    // Try candidate URLs
    const alts = candidates(url);
    let resolved = null;
    for (const alt of alts) {
      const status = await checkUrl(alt);
      if (status === 200) {
        resolved = alt;
        break;
      }
    }

    if (resolved) {
      console.log(`  ✔ Fixed: ${url.slice(0, 60)}`);
      console.log(`       → ${resolved.slice(0, 60)}`);
      const newPublicId = publicIdFromUrl(resolved);
      newImages.push({
        ...img,
        url: resolved,
        public_id: newPublicId || img.public_id,
      });
      changed = true;
      totalFixed++;
    } else {
      console.log(`  ✗ Cannot resolve: ${url.slice(0, 80)}`);
      newImages.push(img); // keep broken URL — better than removing
      totalUnresolvable++;
    }
  }

  if (changed) {
    console.log(`  → Updating: "${prod.title.slice(0, 50)}"\n`);
    if (!DRY_RUN) {
      await Product.updateOne(
        { _id: prod._id },
        { $set: { images: newImages } },
      );
    }
  }
}

// ── summary ───────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════");
console.log(`Images fixed:        ${totalFixed}`);
console.log(`Images unresolvable: ${totalUnresolvable}`);
if (DRY_RUN && totalFixed > 0) {
  console.log("\nRun with --fix to apply these changes to MongoDB.");
}
console.log("═══════════════════════════════════════════════════════");

await mongoose.disconnect();
console.log("✓ Done");
