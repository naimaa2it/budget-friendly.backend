// Shared permanent-delete logic for products, used by both the admin
// "delete permanently" action and the trash-cleanup cron job. Removes the
// product's Cloudinary images, detaches any linked barcodes, then deletes the
// document. Kept self-contained so it has no dependency on the admin router.
import { v2 as cloudinary } from "cloudinary";
import Product from "../models/Product.js";
import Barcode from "../models/Barcode.js";
import { clearProductsCache, clearProductCache } from "./redis.js";

// Retention window before a trashed product is permanently removed (30 days).
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

let cloudinaryConfigured = false;
const ensureCloudinaryConfigured = () => {
  if (!cloudinaryConfigured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    cloudinaryConfigured = true;
  }
};

// Permanently delete every product matched by `filter`. Returns the count of
// documents removed.
export async function permanentlyDeleteProducts(filter) {
  const products = await Product.find(filter);
  let deleted = 0;
  for (const p of products) {
    if (Array.isArray(p.images) && p.images.length > 0) {
      try {
        ensureCloudinaryConfigured();
        for (const img of p.images) {
          if (img && img.public_id) {
            try {
              await cloudinary.uploader.destroy(img.public_id, {
                resource_type: "image",
              });
            } catch {
              // ignore Cloudinary errors — never block the DB delete
            }
          }
        }
      } catch {
        // ignore Cloudinary config errors
      }
    }

    // detach any barcodes still pointing at this product
    await Barcode.updateMany(
      { product: p._id },
      { $set: { product: null, productTitle: "" } },
    );
    await Product.deleteOne({ _id: p._id });
    clearProductCache(p._id);
    deleted++;
  }
  if (deleted > 0) clearProductsCache();
  return deleted;
}
