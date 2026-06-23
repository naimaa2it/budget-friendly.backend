import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import User from "../models/User.js";
import { buildUserRewardsSummary } from "../lib/rewards.js";
import { getUserLoyaltySummary } from "../lib/loyaltyTiers.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
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

// middleware to make sure user is logged in (either user or admin token)
const requireUser = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload.type is either undefined or 'admin'
    const user = await User.findById(payload.id);
    if (!user) return res.status(403).json({ error: "User not found" });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// update profile (name/email/mobile/dob + optional image file)
router.put(
  "/profile",
  requireUser,
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, email, mobile, dob, removeImage } = req.body || {};
      const u = req.user;

      // email change validation
      if (email && email.toLowerCase() !== u.email) {
        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists && exists._id.toString() !== u._id.toString()) {
          return res
            .status(400)
            .json({ error: "Another account already uses that email" });
        }
        u.email = email.toLowerCase();
      }
      if (typeof name !== "undefined") u.name = name;
      if (typeof mobile !== "undefined") u.mobile = mobile;
      if (typeof dob !== "undefined") u.dob = dob;
      if (typeof req.body?.newsletterSubscribed !== "undefined") {
        u.newsletterSubscribed =
          req.body.newsletterSubscribed === "true" ||
          req.body.newsletterSubscribed === true;
      }

      // handle image removal request (only if no new file is being uploaded)
      const wantsRemoveImage = removeImage === "1" || removeImage === "true";
      if (!req.file && wantsRemoveImage && u.imagePublicId) {
        try {
          await ensureCloudinaryConfigured();
          await cloudinary.uploader.destroy(u.imagePublicId);
        } catch (delErr) {}
        u.image = undefined;
        u.imagePublicId = undefined;
      }

      // handle image upload if provided (takes precedence over removal flag)
      if (req.file) {
        // make sure cloudinary credentials exist
        if (
          !process.env.CLOUDINARY_CLOUD_NAME ||
          !process.env.CLOUDINARY_API_KEY ||
          !process.env.CLOUDINARY_API_SECRET
        ) {
          return res
            .status(500)
            .json({ error: "Cloudinary not configured on server" });
        }
        ensureCloudinaryConfigured();

        // optionally resize/convert using sharp (same pattern as admin)
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
          return res.status(400).json({ error: "Invalid image file" });
        }

        const streamUpload = (buffer) =>
          new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: `${process.env.CLOUDINARY_FOLDER || 'PickobBD'}/profiles`,
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

        // delete old image if existed
        if (u.imagePublicId) {
          try {
            await cloudinary.uploader.destroy(u.imagePublicId);
          } catch (delErr) {}
        }

        u.image = result.secure_url || result.url;
        u.imagePublicId = result.public_id;
      }

      await u.save();
      // return sanitized user
      const safe = {
        _id: u._id,
        email: u.email,
        name: u.name,
        mobile: u.mobile,
        dob: u.dob,
        image: u.image,
        role: u.role,
        provider: u.provider,
        isVerified: u.isVerified,
        addresses: u.addresses || [],
        createdAt: u.createdAt,
      };
      res.json({ ok: true, user: safe });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  },
);

// addresses CRUD
router.get("/addresses", requireUser, async (req, res) => {
  res.json({ addresses: req.user.addresses || [] });
});

router.post("/addresses", requireUser, async (req, res) => {
  try {
    const { fullName, email, phone, city, zone, address, type } =
      req.body || {};
    const addr = { fullName, email, phone, city, zone, address, type };
    req.user.addresses.push(addr);
    await req.user.save();
    const added = req.user.addresses[req.user.addresses.length - 1];
    res.json({ ok: true, address: added });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/addresses/:id", requireUser, async (req, res) => {
  try {
    const addr = req.user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ error: "Not found" });
    Object.assign(addr, req.body);
    await req.user.save();
    res.json({ ok: true, address: addr });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/addresses/:id", requireUser, async (req, res) => {
  try {
    // remove address entry by id - avoid using subdocument.remove() which can fail
    // depending on how the document was retrieved.
    const id = req.params.id;
    // using mongoose array pull method is safe
    req.user.addresses.pull(id);
    // if pull doesn't work for some reason, fall back to manual filter
    if (req.user.addresses.some((a) => a._id.toString() === id)) {
      req.user.addresses = req.user.addresses.filter(
        (a) => a._id.toString() !== id,
      );
    }
    await req.user.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// newsletter subscribe / unsubscribe
router.post("/subscribe", requireUser, async (req, res) => {
  try {
    req.user.newsletterSubscribed = true;
    await req.user.save();
    res.json({ ok: true, subscribed: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/unsubscribe", requireUser, async (req, res) => {
  try {
    req.user.newsletterSubscribed = false;
    await req.user.save();
    res.json({ ok: true, subscribed: false });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/user/cart — sync cart to server (called by frontend on every cart change)
router.put("/cart", requireUser, async (req, res) => {
  try {
    const { items } = req.body;
    const cartItems = (items || []).map((item) => ({
      productId: String(
        item.product?._id || item.product?.id || item.productId || "",
      ),
      title: String(item.product?.title || item.title || ""),
      image: String(item.product?.images?.[0] || item.image || ""),
      price: Number(item.selectedVariant?.price || item.product?.price || 0),
      quantity: Number(item.quantity || 1),
      color: item.selectedColor || null,
      size: item.selectedSize || null,
    }));
    req.user.savedCart = { items: cartItems, updatedAt: new Date() };
    await req.user.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/user/wishlist — sync wishlist to server
router.put("/wishlist", requireUser, async (req, res) => {
  try {
    const { items } = req.body; // array of productId strings
    req.user.wishlist = (items || [])
      .filter((id) => typeof id === "string" && id.length > 0)
      .slice(0, 300);
    await req.user.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/user/rewards — balance, order-based points breakdown
router.get("/rewards", requireUser, async (req, res) => {
  try {
    const summary = await buildUserRewardsSummary(req.user._id);
    if (!summary) return res.status(404).json({ error: "User not found" });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/user/loyalty — lifetime spend, current tier, and progress to next tier
router.get("/loyalty", requireUser, async (req, res) => {
  try {
    const summary = await getUserLoyaltySummary(req.user._id);
    res.json({ ok: true, ...summary });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
