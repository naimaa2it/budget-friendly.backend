import express from "express";
import jwt from "jsonwebtoken";
import { uploadLimiter, reviewLimiter } from "../lib/rateLimiters.js";
import Product from "../models/Product.js";
import Barcode from "../models/Barcode.js";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import { redisClient, clearProductsCache } from "../lib/redis.js";

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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
const normalizeBarcodeCode = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "");

const router = express.Router();

// Fields sufficient for product cards on listing/search/homepage — strips
// reviews[], faqs[], ingredients[], specifications[] and other heavy arrays
// only needed on the single-product detail page.  Cuts response size 60-80%.
const CARD_SELECT = [
  "_id title slug price compareAtPrice images",
  "availability inventory badges averageRating reviewCount",
  "freeShipping flashSale flashSalePrice flashSaleEndsAt",
  "variants categoryId department status updatedAt monthlySold",
  "coupon skinTypes spf fragranceFree parabenFree crueltyFree vegan",
].join(" ");

//get products with optional filters: ?q=search&categoryId=123&badge=best-seller&flag=featured&page=1&limit=20&status=published&sort=position&minPrice=10&maxPrice=100&brand=BrandA&minRating=4
// Public product listing with pagination, search, category filter
router.get("/", async (req, res) => {
  try {
    const {
      q,
      categoryId,
      badge,
      flag,
      page = 1,
      limit = 20,
      status = "published",
      sort = "position",
      minPrice,
      maxPrice,
      brand,
      minRating,
      // Skincare filters
      skinType,
      concern,
      formulation,
      minSpf,
      fragranceFree,
      parabenFree,
      crueltyFree,
      vegan,
    } = req.query;
    const skip = (Math.max(1, page) - 1) * limit;
    const filter = {};
    if (status) filter.status = status;
    if (categoryId) {
      // allow comma-separated list of ids
      const ids = String(categoryId)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length === 1) filter.categoryId = ids[0];
      else if (ids.length > 1) filter.categoryId = { $in: ids };
    }
    if (badge) filter.badges = badge;
    // boolean flag fields — whitelist to prevent injection
    const FLAG_MAP = {
      featured: "featured",
      coupon: "coupon",
      "flash-sale": "flashSale",
      clearance: "clearance",
      "free-shipping": "freeShipping",
    };
    if (flag && FLAG_MAP[flag]) filter[FLAG_MAP[flag]] = true;
    if (q) {
      // Use the pre-built text index (title + description + ingredients.inciName)
      // for O(log n) lookup — regex does a full O(n) collection scan.
      // Input capped at 200 chars; $text is injection-safe.
      filter.$text = { $search: String(q).slice(0, 200) };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined && minPrice !== "")
        filter.price.$gte = Number(minPrice);
      if (maxPrice !== undefined && maxPrice !== "")
        filter.price.$lte = Number(maxPrice);
      if (Object.keys(filter.price).length === 0) delete filter.price;
    }

    if (brand) {
      const brands = String(brand)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (brands.length === 1) filter.department = brands[0];
      else if (brands.length > 1) filter.department = { $in: brands };
    }

    if (minRating !== undefined && minRating !== "") {
      filter.averageRating = { $gte: Number(minRating) };
    }

    // Skincare filters — field names must match the Product schema exactly.
    // skinTypes is [String], suitableConcerns is [String], fragranceFree/parabenFree are Boolean.
    if (skinType) {
      const types = String(skinType)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      filter.skinTypes = types.length === 1 ? types[0] : { $in: types };
    }
    if (concern) {
      const concerns = String(concern)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      filter.suitableConcerns =
        concerns.length === 1 ? concerns[0] : { $in: concerns };
    }
    if (formulation) filter.formulation = String(formulation).trim();
    if (minSpf !== undefined && minSpf !== "")
      filter.spf = { $gte: Number(minSpf) };
    if (fragranceFree === "true") filter.fragranceFree = true;
    if (parabenFree === "true") filter.parabenFree = true;
    if (crueltyFree === "true") filter.crueltyFree = true;
    if (vegan === "true") filter.vegan = true;

    const sortMap = {
      position: { updatedAt: -1 },
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      nameAsc: { title: 1 },
      nameDesc: { title: -1 },
      priceHigh: { price: -1 },
      priceLow: { price: 1 },
    };
    let sortBy = sortMap[sort] || sortMap.position;
    // When text search is active and no explicit sort was requested, rank by
    // relevance score rather than recency so the best matches surface first.
    if (q && sort === "position") sortBy = { score: { $meta: "textScore" } };

    // Try cache
    const cacheKey = `products:${Buffer.from(JSON.stringify(req.query || {})).toString("base64")}`;
    if (redisClient?.isReady) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          res.setHeader(
            "Cache-Control",
            "public, max-age=30, stale-while-revalidate=120",
          );
          return res.json(JSON.parse(cached));
        }
      } catch {
        // ignore cache errors
      }
    }

    const [items, total] = await Promise.all([
      Product.find(filter)
        .select(CARD_SELECT)
        .sort(sortBy)
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),
      Product.countDocuments(filter),
    ]);

    const payload = { items, total, page: Number(page), limit: Number(limit) };
    // store in cache (short TTL)
    if (redisClient?.isReady) {
      redisClient
        .setEx(
          cacheKey,
          Number(process.env.PRODUCTS_CACHE_TTL || 60),
          JSON.stringify(payload),
        )
        .catch(() => {});
    }

    res.setHeader(
      "Cache-Control",
      "public, max-age=30, stale-while-revalidate=120",
    );
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Public categories listing (tree-friendly)
router.get("/categories", async (req, res) => {
  try {
    const CAT_CACHE_KEY = "products:categories:v1";
    if (redisClient?.isReady) {
      try {
        const cached = await redisClient.get(CAT_CACHE_KEY);
        if (cached) {
          res.setHeader(
            "Cache-Control",
            "public, max-age=600, stale-while-revalidate=3600",
          );
          return res.json(JSON.parse(cached));
        }
      } catch {}
    }

    const Category = (await import("../models/Category.js")).default;
    const cats = await Category.find({ isActive: true }).sort({
      level: 1,
      order: 1,
      name: 1,
    });
    // build tree — include slug, order and images for client display
    const map = new Map();
    cats.forEach((c) =>
      map.set(String(c._id), {
        _id: c._id,
        name: c.name,
        slug: c.slug,
        parent: c.parent ? String(c.parent) : null,
        level: c.level,
        order: c.order,
        images: c.images || [],
        children: [],
      }),
    );
    const roots = [];
    for (const node of map.values()) {
      if (node.parent && map.has(node.parent))
        map.get(node.parent).children.push(node);
      else roots.push(node);
    }

    const payload = { categories: roots };
    if (redisClient?.isReady) {
      redisClient
        .setEx(CAT_CACHE_KEY, 600, JSON.stringify(payload))
        .catch(() => {});
    }
    res.setHeader(
      "Cache-Control",
      "public, max-age=600, stale-while-revalidate=3600",
    );
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: get ALL questions across all products (dashboard)
router.get("/admin-questions", requireAdmin, async (req, res) => {
  try {
    const products = await Product.find(
      { "faqs.0": { $exists: true } },
      "title faqs categoryId",
    ).lean();
    const rows = [];
    products.forEach((p) => {
      (p.faqs || []).forEach((f, idx) => {
        rows.push({
          productId: p._id,
          productTitle: p.title,
          categoryId: p.categoryId,
          index: idx,
          ...f,
        });
      });
    });
    rows.sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    );
    res.json({ ok: true, rows });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: get ALL reviews across all products (dashboard)
router.get("/admin-reviews", requireAdmin, async (req, res) => {
  try {
    const products = await Product.find(
      { "reviews.0": { $exists: true } },
      "title reviews categoryId",
    ).lean();
    const rows = [];
    products.forEach((p) => {
      (p.reviews || []).forEach((r, idx) => {
        rows.push({
          productId: p._id,
          productTitle: p.title,
          categoryId: p.categoryId,
          index: idx,
          ...r,
        });
      });
    });
    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, rows });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Logged-in customer: get all reviews they've personally written
router.get("/my-reviews", requireUser, async (req, res) => {
  try {
    const products = await Product.find(
      { "reviews.user": req.user._id },
      "title slug images reviews",
    ).lean();

    const myReviews = [];
    products.forEach((p) => {
      (p.reviews || []).forEach((r, idx) => {
        if (String(r.user) === String(req.user._id)) {
          myReviews.push({
            productId: p._id,
            productTitle: p.title,
            productSlug: p.slug,
            productImage: p.images?.[0]?.url || null,
            reviewIndex: idx,
            rating: r.rating,
            title: r.title,
            body: r.body,
            images: r.images,
            helpful: r.helpful,
            createdAt: r.createdAt,
          });
        }
      });
    });
    myReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ reviews: myReviews });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/barcode/:code", async (req, res) => {
  try {
    const code = normalizeBarcodeCode(req.params.code);
    if (!code)
      return res.status(400).json({ error: "Barcode code is required" });

    const barcodeRecord = await Barcode.findOne({ code, isActive: true })
      .populate(
        "product",
        "title price compareAtPrice images slug availability barcode sku status",
      )
      .lean();
    if (
      barcodeRecord?.product &&
      normalizeBarcodeCode(barcodeRecord.product.barcode) === code
    ) {
      return res.json({
        product: barcodeRecord.product,
        barcode: barcodeRecord,
      });
    }

    const product = await Product.findOne({ barcode: code })
      .populate(
        "frequentlyBoughtTogether",
        "title price compareAtPrice images slug availability _id",
      )
      .lean();
    if (product) {
      return res.json({ product, barcode: barcodeRecord || null });
    }

    return res.status(404).json({ error: "Barcode not found" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const prodCacheKey = `product:${req.params.id}`;
    if (redisClient?.isReady) {
      try {
        const cached = await redisClient.get(prodCacheKey);
        if (cached) return res.json({ product: JSON.parse(cached) });
      } catch {
        // ignore cache errors
      }
    }

    const prod = await Product.findById(req.params.id)
      .populate(
        "frequentlyBoughtTogether",
        "title price compareAtPrice images slug availability _id",
      )
      .lean();
    if (!prod) return res.status(404).json({ error: "Not found" });
    // cache product detail for a bit longer
    if (redisClient?.isReady) {
      redisClient
        .setEx(
          prodCacheKey,
          Number(process.env.PRODUCT_CACHE_TTL || 300),
          JSON.stringify(prod),
        )
        .catch(() => {});
    }
    res.json({ product: prod });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Middleware: logged-in user (regular user JWT)
async function requireUser(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token)
      return res
        .status(401)
        .json({ error: "Please login first to submit a review." });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type === "admin")
      return res
        .status(403)
        .json({ error: "Use a customer account to submit reviews." });
    const User = (await import("../models/User.js")).default;
    const user = await User.findById(payload.id).select("name email role");
    if (!user) return res.status(401).json({ error: "User not found." });
    req.user = user;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ error: "Invalid session. Please login again." });
  }
}

// Middleware: admin/moderator only
async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== "admin")
      return res.status(403).json({ error: "Admin access required" });
    const Admin = (await import("../models/Admin.js")).default;
    const admin = await Admin.findById(payload.id);
    if (!admin || !admin.isActive)
      return res.status(403).json({ error: "Admin not found or disabled" });
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Upload review images — authenticated users only, max 4 images, 3MB each
const reviewImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 4 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
  },
});

router.post("/review-images/upload", requireUser, reviewImageUpload.array("images", 4), async (req, res) => {
  try {
    ensureCloudinaryConfigured();
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    const urls = await Promise.all(
      req.files.map((file) =>
        new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: `${process.env.CLOUDINARY_FOLDER || "SmartBuyBD"}/reviews`, quality: "auto", fetch_format: "auto" },
            (err, result) => {
              if (err) reject(err);
              else resolve(result.secure_url);
            },
          ).end(file.buffer);
        }),
      ),
    );
    res.json({ ok: true, urls });
  } catch (err) {
    res.status(500).json({ error: "Upload failed" });
  }
});

// Submit a review (must be logged-in user)
router.post("/:id/reviews", requireUser, reviewLimiter, async (req, res) => {
  try {
    const { authorName, rating, body, images } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ error: "Rating (1-5) is required" });
    if (!body?.trim())
      return res.status(400).json({ error: "Review comment is required" });
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: "Product not found" });
    const displayName =
      authorName?.trim() || req.user.name || req.user.email.split("@")[0];
    // validate images: max 4 URLs, must be strings
    const reviewImages = Array.isArray(images)
      ? images.filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, 4)
      : [];
    prod.reviews.push({
      user: req.user._id,
      authorName: displayName,
      rating: Number(rating),
      body: body.trim(),
      images: reviewImages,
      createdAt: new Date(),
    });
    await prod.save();
    res.json({
      ok: true,
      reviews: prod.reviews,
      averageRating: prod.averageRating,
      reviewCount: prod.reviewCount,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Edit a review (must be the review's owner)
router.put("/:id/reviews/:index", requireUser, async (req, res) => {
  try {
    const { authorName, rating, body, images } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ error: "Rating (1-5) is required" });
    if (!body?.trim())
      return res.status(400).json({ error: "Review comment is required" });
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: "Product not found" });
    const idx = Number(req.params.index);
    if (idx < 0 || idx >= prod.reviews.length)
      return res.status(404).json({ error: "Review not found" });
    const review = prod.reviews[idx];
    if (review.user?.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ error: "You can only edit your own reviews." });
    const EDIT_WINDOW_MS = 10 * 60 * 1000;
    if (Date.now() - new Date(review.createdAt).getTime() > EDIT_WINDOW_MS)
      return res
        .status(403)
        .json({ error: "Edit window expired. Reviews can only be edited within 10 minutes of posting." });
    review.authorName =
      authorName?.trim() || req.user.name || req.user.email.split("@")[0];
    review.rating = Number(rating);
    review.body = body.trim();
    if (Array.isArray(images)) {
      review.images = images.filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, 4);
    }
    await prod.save();
    res.json({
      ok: true,
      reviews: prod.reviews,
      averageRating: prod.averageRating,
      reviewCount: prod.reviewCount,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Delete a review (admin/moderator only)
router.delete("/:id/reviews/:index", requireAdmin, async (req, res) => {
  try {
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: "Product not found" });
    const idx = Number(req.params.index);
    if (idx < 0 || idx >= prod.reviews.length)
      return res.status(404).json({ error: "Review not found" });
    prod.reviews.splice(idx, 1);
    await prod.save();
    res.json({
      ok: true,
      reviews: prod.reviews,
      averageRating: prod.averageRating,
      reviewCount: prod.reviewCount,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: edit any review (no ownership check)
router.put(
  "/admin-reviews/:productId/:index",
  requireAdmin,
  async (req, res) => {
    try {
      const { rating, body } = req.body;
      const prod = await Product.findById(req.params.productId);
      if (!prod) return res.status(404).json({ error: "Product not found" });
      const idx = Number(req.params.index);
      if (idx < 0 || idx >= prod.reviews.length)
        return res.status(404).json({ error: "Review not found" });
      if (rating !== undefined) prod.reviews[idx].rating = Number(rating);
      if (body !== undefined) prod.reviews[idx].body = body;
      await prod.save();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Submit a question (must be logged-in user)
router.post("/:id/questions", requireUser, async (req, res) => {
  try {
    const { question, askerName } = req.body;
    if (!question?.trim())
      return res.status(400).json({ error: "Question is required" });
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: "Product not found" });
    const displayName =
      askerName?.trim() || req.user.name || req.user.email.split("@")[0];
    prod.faqs.push({
      question: question.trim(),
      answers: [],
      user: req.user._id,
      askerName: displayName,
      createdAt: new Date(),
    });
    await prod.save();
    res.json({ ok: true, faqs: prod.faqs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Edit own question (owner only, unanswered)
router.put("/:id/questions/:index", requireUser, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question?.trim())
      return res.status(400).json({ error: "Question is required" });
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: "Product not found" });
    const idx = Number(req.params.index);
    if (idx < 0 || idx >= prod.faqs.length)
      return res.status(404).json({ error: "Question not found" });
    const faq = prod.faqs[idx];
    if (faq.user?.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ error: "You can only edit your own questions." });
    faq.question = question.trim();
    await prod.save();
    res.json({ ok: true, faqs: prod.faqs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Submit a community answer to a question (any logged-in user)
router.post("/:id/questions/:qIdx/answers", requireUser, async (req, res) => {
  try {
    const { body, authorName } = req.body;
    if (!body?.trim())
      return res.status(400).json({ error: "Answer body is required" });
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: "Product not found" });
    const qIdx = Number(req.params.qIdx);
    if (qIdx < 0 || qIdx >= prod.faqs.length)
      return res.status(404).json({ error: "Question not found" });
    const displayName =
      authorName?.trim() || req.user.name || req.user.email.split("@")[0];
    prod.faqs[qIdx].answers = prod.faqs[qIdx].answers || [];
    prod.faqs[qIdx].answers.push({
      user: req.user._id,
      authorName: displayName,
      body: body.trim(),
      isOfficial: false,
      helpful: 0,
      helpfulBy: [],
      createdAt: new Date(),
    });
    prod.markModified("faqs");
    await prod.save();
    if (redisClient?.isReady) {
      redisClient.del(`product:${req.params.id}`).catch(() => {});
    }
    res.json({ ok: true, faqs: prod.faqs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Edit own community answer
router.put(
  "/:id/questions/:qIdx/answers/:aIdx",
  requireUser,
  async (req, res) => {
    try {
      const { body } = req.body;
      if (!body?.trim())
        return res.status(400).json({ error: "Answer body is required" });
      const prod = await Product.findById(req.params.id);
      if (!prod) return res.status(404).json({ error: "Product not found" });
      const qIdx = Number(req.params.qIdx);
      const aIdx = Number(req.params.aIdx);
      if (qIdx < 0 || qIdx >= prod.faqs.length)
        return res.status(404).json({ error: "Question not found" });
      const answers = prod.faqs[qIdx].answers || [];
      if (aIdx < 0 || aIdx >= answers.length)
        return res.status(404).json({ error: "Answer not found" });
      const ans = answers[aIdx];
      if (ans.isOfficial)
        return res
          .status(403)
          .json({ error: "Cannot edit the official seller answer." });
      if (ans.user?.toString() !== req.user._id.toString())
        return res
          .status(403)
          .json({ error: "You can only edit your own answers." });
      ans.body = body.trim();
      prod.markModified("faqs");
      await prod.save();
      if (redisClient?.isReady) {
        redisClient.del(`product:${req.params.id}`).catch(() => {});
      }
      res.json({ ok: true, faqs: prod.faqs });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Toggle helpful vote on a specific answer
router.post(
  "/:id/questions/:qIdx/answers/:aIdx/helpful",
  requireUser,
  async (req, res) => {
    try {
      const prod = await Product.findById(req.params.id);
      if (!prod) return res.status(404).json({ error: "Product not found" });
      const qIdx = Number(req.params.qIdx);
      const aIdx = Number(req.params.aIdx);
      if (qIdx < 0 || qIdx >= prod.faqs.length)
        return res.status(404).json({ error: "Question not found" });
      const answers = prod.faqs[qIdx].answers || [];
      if (aIdx < 0 || aIdx >= answers.length)
        return res.status(404).json({ error: "Answer not found" });
      const ans = answers[aIdx];
      const uid = req.user._id.toString();
      const already = (ans.helpfulBy || []).map(String).includes(uid);
      if (already) {
        ans.helpfulBy = (ans.helpfulBy || []).filter(
          (id) => id.toString() !== uid,
        );
        ans.helpful = Math.max(0, (ans.helpful || 1) - 1);
      } else {
        ans.helpfulBy = [...(ans.helpfulBy || []), req.user._id];
        ans.helpful = (ans.helpful || 0) + 1;
      }
      prod.markModified("faqs");
      await prod.save();
      res.json({
        ok: true,
        helpful: ans.helpful,
        voted: !already,
        faqs: prod.faqs,
      });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Admin: answer or edit any question
router.put(
  "/admin-questions/:productId/:index",
  requireAdmin,
  async (req, res) => {
    try {
      const { question, officialAnswer } = req.body;
      const adminName =
        req.admin.name || req.admin.email?.split("@")[0] || "Admin";
      const prod = await Product.findById(req.params.productId);
      if (!prod) return res.status(404).json({ error: "Product not found" });
      const idx = Number(req.params.index);
      if (idx < 0 || idx >= prod.faqs.length)
        return res.status(404).json({ error: "Question not found" });
      const faq = prod.faqs[idx];
      if (question !== undefined) faq.question = question.trim();
      if (officialAnswer !== undefined) {
        faq.answers = faq.answers || [];
        const existingIdx = faq.answers.findIndex((a) => a.isOfficial);
        if (officialAnswer.trim() === "") {
          if (existingIdx >= 0) faq.answers.splice(existingIdx, 1);
        } else if (existingIdx >= 0) {
          faq.answers[existingIdx].body = officialAnswer.trim();
          faq.answers[existingIdx].authorName = adminName;
          faq.answers[existingIdx].createdAt = new Date();
        } else {
          faq.answers.unshift({
            body: officialAnswer.trim(),
            isOfficial: true,
            authorName: adminName,
            helpful: 0,
            helpfulBy: [],
            createdAt: new Date(),
          });
        }
      }
      prod.markModified("faqs");
      await prod.save();
      if (redisClient?.isReady) {
        redisClient.del(`product:${req.params.productId}`).catch(() => {});
      }
      res.json({ ok: true, faqs: prod.faqs });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Admin: delete a specific answer
router.delete(
  "/admin-questions/:productId/:qIdx/answers/:aIdx",
  requireAdmin,
  async (req, res) => {
    try {
      const prod = await Product.findById(req.params.productId);
      if (!prod) return res.status(404).json({ error: "Product not found" });
      const qIdx = Number(req.params.qIdx);
      const aIdx = Number(req.params.aIdx);
      if (qIdx < 0 || qIdx >= prod.faqs.length)
        return res.status(404).json({ error: "Question not found" });
      const answers = prod.faqs[qIdx].answers || [];
      if (aIdx < 0 || aIdx >= answers.length)
        return res.status(404).json({ error: "Answer not found" });
      prod.faqs[qIdx].answers.splice(aIdx, 1);
      prod.markModified("faqs");
      await prod.save();
      if (redisClient?.isReady) {
        redisClient.del(`product:${req.params.productId}`).catch(() => {});
      }
      res.json({ ok: true, faqs: prod.faqs });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Admin: delete a question
router.delete(
  "/admin-questions/:productId/:index",
  requireAdmin,
  async (req, res) => {
    try {
      const prod = await Product.findById(req.params.productId);
      if (!prod) return res.status(404).json({ error: "Product not found" });
      const idx = Number(req.params.index);
      if (idx < 0 || idx >= prod.faqs.length)
        return res.status(404).json({ error: "Question not found" });
      prod.faqs.splice(idx, 1);
      await prod.save();
      res.json({ ok: true, faqs: prod.faqs });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Upload image (optimized server-side) - returns Cloudinary asset
router.post(
  "/upload",
  requireAdmin,
  uploadLimiter,
  upload.single("file"),
  async (req, res) => {
    try {
      ensureCloudinaryConfigured(); // configure on first use

      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      if (
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        return res.status(500).json({
          error:
            "Server upload not configured (Cloudinary credentials missing).",
        });
      }

      const maxWidth = Number(process.env.IMG_MAX_WIDTH) || 1600;
      const quality = Number(process.env.IMG_QUALITY) || 75;

      let optimizedBuffer;
      try {
        optimizedBuffer = await sharp(req.file.buffer)
          .rotate()
          .resize({ width: maxWidth, withoutEnlargement: true })
          .webp({ quality })
          .toBuffer();
      } catch (sharpErr) {
        return res
          .status(400)
          .json({ error: "Invalid image file or unsupported format." });
      }

      const streamUpload = (buffer) =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: `${process.env.CLOUDINARY_FOLDER || 'SmartBuyBD'}/products`,
              resource_type: "image",
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          );
          stream.end(buffer);
        });

      const result = await streamUpload(optimizedBuffer);
      res.json({
        ok: true,
        asset: {
          public_id: result.public_id,
          url: result.secure_url || result.url,
          width: result.width,
          height: result.height,
          format: result.format,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  },
);

// Batch fetch products by IDs — used by cart hydration to refresh prices/stock
// GET /api/products/batch?ids=id1,id2,id3 (max 50)
router.get("/batch", async (req, res) => {
  try {
    const raw = (req.query.ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (raw.length === 0) return res.json({ products: [] });
    const ids = raw.slice(0, 50);
    // Only fields needed by CartContext: prices, stock, images, variants for
    // variant-price lookup.  Strip reviews/faqs/ingredients to keep payload small.
    const products = await Product.find({ _id: { $in: ids } })
      .select(
        "_id title price compareAtPrice images availability inventory slug variants freeShipping",
      )
      .lean();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
