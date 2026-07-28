/**
 * One-time migration: copy every Cloudinary-hosted image/video into the
 * VPS's local /uploads storage (by re-uploading through the LIVE
 * `POST /api/admin/upload` endpoint on api.pickob.com) and rewrite the
 * matching DB field to the new api.pickob.com URL.
 *
 * - Cloudinary originals are NOT deleted. This only copies forward — delete
 *   the old assets from the Cloudinary dashboard yourself, later, once
 *   you've visually confirmed everything still renders on the live site.
 * - Idempotent / safe to re-run: any URL that's already on api.pickob.com
 *   is left alone, so an interrupted run can just be started again.
 * - Runs sequentially with a small delay between uploads — the target is
 *   the live production server, not a throwaway box.
 *
 * Covers: Product.images[] + Product.detailedDescription (recursively),
 * Category.images[], Banner.image, Popup.image, PromoPanel.image,
 * PromoStripItem.image, OccasionSection.cards[].image,
 * BlogPost.featuredImage/additionalImages[]/videos[], Setting.websiteLogo,
 * Setting.favicon, User.image, Review.images[].
 * NOT covered: raw <img> tags hand-pasted into rich-text HTML (e.g. blog
 * post body content) — those aren't stored as structured image fields.
 *
 * Usage:
 *   node scripts/migrateCloudinaryToVps.js                # dry run (default) — reports only, no uploads/writes
 *   node scripts/migrateCloudinaryToVps.js --live          # actually uploads + writes to the DB
 *   node scripts/migrateCloudinaryToVps.js --live --only=products,categories
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

// Load .env from the backend root regardless of the shell's current
// directory (e.g. running this from inside scripts/ after `cd scripts`).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
// Always the live VPS — this script's entire job is to populate it,
// regardless of whatever BACKEND_URL your local .env happens to have.
const API_BASE = "https://api.pickob.com";
const LIVE = process.argv.includes("--live");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "")
  .replace("--only=", "")
  .split(",")
  .filter(Boolean);
const DELAY_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isCloudinaryUrl = (u) =>
  typeof u === "string" && u.includes("res.cloudinary.com");

const folderFromPublicId = (publicId, fallback) =>
  typeof publicId === "string" && publicId.includes("/")
    ? publicId.split("/").slice(0, -1).join("/")
    : fallback;

const stats = { migrated: 0, skipped: 0, failed: 0 };

let cachedToken = null;
async function getAdminToken(db) {
  if (cachedToken) return cachedToken;
  const admin = await db.collection("admins").findOne({ isActive: true });
  if (!admin) throw new Error("No active admin found to mint an upload token");
  cachedToken = jwt.sign(
    { id: admin._id, role: admin.role, type: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "3h" },
  );
  return cachedToken;
}

async function reupload(url, folder, token) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download failed (${resp.status})`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const contentType = resp.headers.get("content-type") || "image/jpeg";

  const form = new FormData();
  form.set("folder", folder);
  form.set(
    "file",
    new Blob([buf], { type: contentType }),
    (url.split("/").pop() || "image").split("?")[0],
  );

  const uploadResp = await fetch(`${API_BASE}/api/admin/upload`, {
    method: "POST",
    headers: { Cookie: `token=${token}` },
    body: form,
  });
  const data = await uploadResp.json().catch(() => ({}));
  if (!uploadResp.ok || !data.asset) {
    throw new Error(
      `upload failed (${uploadResp.status}): ${JSON.stringify(data)}`,
    );
  }
  return data.asset;
}

// Migrates a {public_id, url, width, height, format} object in place.
// Returns true if the object was actually mutated.
async function migrateImageObject(img, defaultFolder, token) {
  if (!img || !isCloudinaryUrl(img.url)) return false;
  if (!LIVE) {
    console.log(`  [dry-run] would migrate: ${img.url}`);
    stats.migrated++;
    return false;
  }
  try {
    const folder = folderFromPublicId(img.public_id, defaultFolder);
    const asset = await reupload(img.url, folder, token);
    img.public_id = asset.public_id;
    img.url = asset.url;
    if (asset.width) img.width = asset.width;
    if (asset.height) img.height = asset.height;
    if (asset.format) img.format = asset.format;
    stats.migrated++;
    console.log(`  ✓ ${img.url}`);
    await sleep(DELAY_MS);
    return true;
  } catch (err) {
    stats.failed++;
    console.warn(`  ✗ failed (${img.url}): ${err.message}`);
    return false;
  }
}

// Migrates a bare URL string (Review.images[], User.image). Returns the new
// URL, or the original one unchanged if not Cloudinary / dry-run / failed.
async function migrateUrlString(url, folder, token) {
  if (!isCloudinaryUrl(url)) return url;
  if (!LIVE) {
    console.log(`  [dry-run] would migrate: ${url}`);
    stats.migrated++;
    return url;
  }
  try {
    const asset = await reupload(url, folder, token);
    stats.migrated++;
    console.log(`  ✓ ${url}`);
    await sleep(DELAY_MS);
    return asset.url;
  } catch (err) {
    stats.failed++;
    console.warn(`  ✗ failed (${url}): ${err.message}`);
    return url;
  }
}

// Recursively walks an arbitrary JSON value (Product.detailedDescription is
// a Mixed block-array) and migrates any {url,...}-shaped Cloudinary object
// found anywhere inside it, in place.
async function walkAndMigrate(value, defaultFolder, token) {
  if (Array.isArray(value)) {
    for (const item of value) await walkAndMigrate(item, defaultFolder, token);
    return;
  }
  if (value && typeof value === "object") {
    if (isCloudinaryUrl(value.url)) {
      await migrateImageObject(value, defaultFolder, token);
    }
    for (const key of Object.keys(value)) {
      await walkAndMigrate(value[key], defaultFolder, token);
    }
  }
}

async function migrateProducts(db, token) {
  console.log("\n=== Products ===");
  const col = db.collection("products");
  for await (const doc of col.find({})) {
    let changed = false;
    if (Array.isArray(doc.images)) {
      for (const img of doc.images) {
        if (await migrateImageObject(img, "Pickob/products", token)) changed = true;
      }
    }
    if (doc.detailedDescription) {
      const before = JSON.stringify(doc.detailedDescription);
      await walkAndMigrate(doc.detailedDescription, "Pickob/products", token);
      if (JSON.stringify(doc.detailedDescription) !== before) changed = true;
    }
    if (changed && LIVE) {
      await col.updateOne(
        { _id: doc._id },
        {
          $set: {
            images: doc.images,
            detailedDescription: doc.detailedDescription,
          },
        },
      );
    }
  }
}

async function migrateCategories(db, token) {
  console.log("\n=== Categories ===");
  const col = db.collection("categories");
  for await (const doc of col.find({})) {
    if (!Array.isArray(doc.images)) continue;
    let changed = false;
    for (const img of doc.images) {
      if (await migrateImageObject(img, "Pickob/categories", token)) changed = true;
    }
    if (changed && LIVE) {
      await col.updateOne({ _id: doc._id }, { $set: { images: doc.images } });
    }
  }
}

async function migrateSingleImageField(db, collectionName, folder, label) {
  console.log(`\n=== ${label} ===`);
  const col = db.collection(collectionName);
  const token = LIVE ? await getAdminToken(db) : null;
  for await (const doc of col.find({})) {
    if (!doc.image) continue;
    const changed = await migrateImageObject(doc.image, folder, token);
    if (changed && LIVE) {
      await col.updateOne({ _id: doc._id }, { $set: { image: doc.image } });
    }
  }
}

async function migrateOccasions(db, token) {
  console.log("\n=== Occasion Sections ===");
  const col = db.collection("occasionsections");
  for await (const doc of col.find({})) {
    if (!Array.isArray(doc.cards)) continue;
    let changed = false;
    for (const card of doc.cards) {
      if (await migrateImageObject(card.image, "Pickob/occasions", token)) {
        changed = true;
      }
    }
    if (changed && LIVE) {
      await col.updateOne({ _id: doc._id }, { $set: { cards: doc.cards } });
    }
  }
}

async function migrateBlogPosts(db, token) {
  console.log("\n=== Blog Posts ===");
  const col = db.collection("blogposts");
  for await (const doc of col.find({})) {
    let changed = false;
    if (await migrateImageObject(doc.featuredImage, "Pickob/blog", token)) {
      changed = true;
    }
    if (Array.isArray(doc.additionalImages)) {
      for (const img of doc.additionalImages) {
        if (await migrateImageObject(img, "Pickob/blog", token)) changed = true;
      }
    }
    if (Array.isArray(doc.videos)) {
      for (const vid of doc.videos) {
        if (await migrateImageObject(vid, "Pickob/blog", token)) changed = true;
      }
    }
    if (changed && LIVE) {
      await col.updateOne(
        { _id: doc._id },
        {
          $set: {
            featuredImage: doc.featuredImage,
            additionalImages: doc.additionalImages,
            videos: doc.videos,
          },
        },
      );
    }
  }
}

async function migrateSettings(db, token) {
  console.log("\n=== Settings ===");
  const col = db.collection("settings");
  for await (const doc of col.find({})) {
    let changed = false;
    if (await migrateImageObject(doc.websiteLogo, "Pickob/settings", token)) {
      changed = true;
    }
    if (await migrateImageObject(doc.favicon, "Pickob/settings", token)) {
      changed = true;
    }
    if (changed && LIVE) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { websiteLogo: doc.websiteLogo, favicon: doc.favicon } },
      );
    }
  }
}

async function migrateUsers(db, token) {
  console.log("\n=== User Avatars ===");
  const col = db.collection("users");
  for await (const doc of col.find({ image: { $regex: "res.cloudinary.com" } })) {
    const newUrl = await migrateUrlString(doc.image, "Pickob/profiles", token);
    if (newUrl !== doc.image && LIVE) {
      // imagePublicId can't be recovered from migrateUrlString (it only
      // returns the url) — re-derive it from the just-uploaded asset by
      // reading it back isn't worth the round trip; clearing it is safe,
      // the field is only used for future avatar deletion bookkeeping.
      await col.updateOne(
        { _id: doc._id },
        { $set: { image: newUrl }, $unset: { imagePublicId: "" } },
      );
    }
  }
}

async function migrateReviews(db, token) {
  console.log("\n=== Review Images ===");
  const col = db.collection("reviews");
  for await (const doc of col.find({ images: { $elemMatch: { $regex: "res.cloudinary.com" } } })) {
    let changed = false;
    const newImages = [];
    for (const url of doc.images) {
      const newUrl = await migrateUrlString(url, "Pickob/reviews", token);
      if (newUrl !== url) changed = true;
      newImages.push(newUrl);
    }
    if (changed && LIVE) {
      await col.updateOne({ _id: doc._id }, { $set: { images: newImages } });
    }
  }
}

const MIGRATORS = {
  products: migrateProducts,
  categories: migrateCategories,
  banners: (db, token) => migrateSingleImageField(db, "banners", "Pickob/banners", "Banners"),
  popups: (db, token) => migrateSingleImageField(db, "popups", "Pickob/popups", "Popups"),
  promopanels: (db, token) =>
    migrateSingleImageField(db, "promopanels", "Pickob/promo", "Promo Panels"),
  promostrip: (db, token) =>
    migrateSingleImageField(db, "promostripitems", "Pickob/promo", "Promo Strip"),
  occasions: migrateOccasions,
  blog: migrateBlogPosts,
  settings: migrateSettings,
  users: migrateUsers,
  reviews: migrateReviews,
};

async function run() {
  if (!MONGODB_URI) throw new Error("MONGODB_URI not set in .env");
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection;
  console.log(
    `Connected to MongoDB. Mode: ${LIVE ? "LIVE (will upload + write)" : "DRY RUN (report only, nothing changes)"}`,
  );
  if (!LIVE) {
    console.log(
      "Re-run with --live once this looks right to actually migrate.\n",
    );
  }

  const token = LIVE ? await getAdminToken(db) : null;
  const names = ONLY.length ? ONLY : Object.keys(MIGRATORS);

  for (const name of names) {
    const fn = MIGRATORS[name];
    if (!fn) {
      console.warn(`Unknown --only target "${name}", skipping`);
      continue;
    }
    await fn(db, token);
  }

  console.log("\n─────────────────────────────────────────");
  console.log(`${LIVE ? "Migrated" : "Would migrate"}: ${stats.migrated}`);
  console.log(`Failed:   ${stats.failed}`);
  console.log("─────────────────────────────────────────\n");
  if (!LIVE) {
    console.log("Nothing was uploaded or written (dry run). Run again with --live to apply.");
  } else {
    console.log("Cloudinary originals were left untouched — delete them manually once you've confirmed everything renders correctly.");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
