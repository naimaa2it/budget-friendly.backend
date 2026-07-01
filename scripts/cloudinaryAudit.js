/**
 * cloudinaryAudit.js
 * Lists ALL image assets in Cloudinary across every known folder so we can
 * see exactly what survived the SmartBuyBD → Pickob migration.
 *
 * Run:  node scripts/cloudinaryAudit.js
 */
import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const fetchFolder = async (prefix) => {
  const items = [];
  let cursor;
  do {
    try {
      const r = await cloudinary.api.resources({
        type: "upload",
        resource_type: "image",
        prefix,
        max_results: 500,
        ...(cursor ? { next_cursor: cursor } : {}),
      });
      items.push(...(r.resources || []).map((a) => a.public_id));
      cursor = r.next_cursor;
    } catch (e) {
      if (e.error?.http_code === 404) break; // folder doesn't exist
      console.error(`  Error fetching ${prefix}:`, e.message);
      break;
    }
  } while (cursor);
  return items;
};

const FOLDERS = [
  "SmartBuyBD/",
  "SmartBuyBD/media/",
  "SmartBuyBD/products/",
  "Pickob/",
  "Pickob/media/",
  "Pickob/products/",
  "yourhaat/",
  "yourhaat/products/",
];

console.log("Scanning all known Cloudinary folders...\n");

for (const folder of FOLDERS) {
  const assets = await fetchFolder(folder);
  console.log(`${folder.padEnd(25)} → ${assets.length} images`);
  if (assets.length > 0 && assets.length <= 5) {
    assets.forEach((id) => console.log(`    ${id}`));
  }
}

console.log("\n✓ Done");
