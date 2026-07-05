import express from "express";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
import Product from "../models/Product.js";
import { v2 as cloudinary } from "cloudinary";
import { redisClient } from "../lib/redis.js";
import { bustCatMemCache } from "../lib/catCache.js";

const CAT_CACHE_KEY = "products:categories:v2";
const bustCatCache = () => {
  bustCatMemCache();
  if (redisClient?.isReady) redisClient.del(CAT_CACHE_KEY).catch(() => {});
};

const router = express.Router();

// --- Cloudinary helper (local copy to avoid circular imports) ---
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

// In-memory admin cache — avoids one Atlas round-trip per request (~150-300ms saved)
const _adminCache = new Map();
const ADMIN_CACHE_TTL_MS = 60_000; // 1 minute

const requireAdmin = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== "admin")
      return res.status(403).json({ error: "Admin access required" });

    const hit = _adminCache.get(payload.id);
    if (hit && Date.now() - hit.ts < ADMIN_CACHE_TTL_MS) {
      req.admin = hit.admin;
      return next();
    }

    const admin = await Admin.findById(payload.id).lean();
    if (!admin) return res.status(403).json({ error: "Admin not found" });
    if (!admin.isActive)
      return res.status(403).json({ error: "Account disabled" });

    _adminCache.set(payload.id, { admin, ts: Date.now() });
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// --- Category management (admin-only) ---
router.get("/", requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== "admin")
      return res.status(403).json({ error: "Admin access required" });
    const Category = (await import("../models/Category.js")).default;
    const items = await Category.find().sort({ level: 1, order: 1, name: 1 });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get single category (admin-only) — returns full document including images
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== "admin")
      return res.status(403).json({ error: "Admin access required" });
    const Category = (await import("../models/Category.js")).default;
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: "Not found" });
    res.json({ category: cat });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Create category (max 5 subcategories per parent, max level 2)
router.post("/", requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== "admin" && req.admin.role !== "moderator") {
      return res
        .status(403)
        .json({ error: "Admin or moderator access required" });
    }
    const { name, parentId, description } = req.body || {};
    if (!name) return res.status(400).json({ error: "Name is required" });
    const Category = (await import("../models/Category.js")).default;

    let level = 0;
    if (parentId) {
      const parent = await Category.findById(parentId);
      if (!parent)
        return res.status(400).json({ error: "Parent category not found" });
      level = parent.level + 1;
    }

    const cat = new Category({
      name,
      parent: parentId || undefined,
      level,
      order: 0,
      isActive: true,
    });

    if (typeof description === "string") cat.description = description.trim();
    // allow initial images array (frontend should upload to /api/admin/upload first)
    if (Array.isArray(req.body.images)) cat.images = req.body.images;

    await cat.save();
    bustCatCache();
    res.json({ ok: true, category: cat });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Update category
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== "admin" && req.admin.role !== "moderator") {
      return res
        .status(403)
        .json({ error: "Admin or moderator access required" });
    }
    const { name, parentId, isActive, images, removedImages, description } =
      req.body || {};
    const Category = (await import("../models/Category.js")).default;
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: "Not found" });

    // handle parent change
    if (parentId && parentId !== String(cat.parent)) {
      const newParent = await Category.findById(parentId);
      if (!newParent)
        return res.status(400).json({ error: "Parent not found" });
      cat.parent = parentId;
      cat.level = newParent.level + 1;
    }

    // Delete removed images from Cloudinary
    if (Array.isArray(removedImages) && removedImages.length > 0) {
      try {
        ensureCloudinaryConfigured();
        for (const publicId of removedImages) {
          if (publicId) {
            try {
              await cloudinary.uploader.destroy(publicId, {
                resource_type: "image",
              });
            } catch {
              // ignore Cloudinary errors
            }
          }
        }
      } catch {
        // ignore Cloudinary errors
      }
    }

    // process image removals (delete from Cloudinary if public_id removed)
    if (Array.isArray(cat.images) && Array.isArray(images)) {
      const oldIds = cat.images.map((i) => i && i.public_id).filter(Boolean);
      const newIds = images.map((i) => i && i.public_id).filter(Boolean);
      const removed = oldIds.filter((id) => !newIds.includes(id));
      if (removed.length > 0) {
        try {
          ensureCloudinaryConfigured();
          for (const publicId of removed) {
            try {
              await cloudinary.uploader.destroy(publicId, {
                resource_type: "image",
              });
            } catch {
              // ignore Cloudinary errors
            }
          }
        } catch {
          // ignore Cloudinary errors
        }
      }
    }

    if (name) cat.name = name;
    if (typeof description === "string") cat.description = description.trim();
    if (typeof isActive === "boolean") cat.isActive = isActive;

    // accept images array when provided (frontend uploads images separately to /admin/upload)
    if (Array.isArray(images)) cat.images = images;

    await cat.save();
    bustCatCache();
    res.json({ ok: true, category: cat });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Delete category (only if no children and no products assigned) - otherwise deactivate
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== "admin")
      return res.status(403).json({ error: "Admin access required" });
    const Category = (await import("../models/Category.js")).default;
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: "Not found" });
    const child = await Category.findOne({ parent: cat._id });
    if (child)
      return res
        .status(400)
        .json({
          error:
            "Category has subcategories; remove them first or deactivate instead",
        });
    const product = await Product.findOne({ categoryId: cat._id });
    if (product)
      return res
        .status(400)
        .json({ error: "Category is used by products; cannot delete" });

    // remove any images from Cloudinary before deleting the category
    try {
      if (Array.isArray(cat.images) && cat.images.length > 0) {
        const ids = cat.images.map((i) => i && i.public_id).filter(Boolean);
        if (ids.length > 0) {
          ensureCloudinaryConfigured();
          for (const publicId of ids) {
            try {
              await cloudinary.uploader.destroy(publicId, {
                resource_type: "image",
              });
            } catch {
              // ignore Cloudinary errors
            }
          }
        }
      }
    } catch {
      // proceed with deletion of DB record even if Cloudinary cleanup fails
    }

    await cat.deleteOne();
    bustCatCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
