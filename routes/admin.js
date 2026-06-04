import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import Admin from '../models/Admin.js';
import User from '../models/User.js';
import CustomerTag from '../models/CustomerTag.js';
import Barcode from '../models/Barcode.js';
import Product from '../models/Product.js';
import Variation from '../models/Variation.js';
import BlogPost from '../models/BlogPost.js';
import BlogCategory from '../models/BlogCategory.js';
import Order from '../models/Order.js';
import sharp from 'sharp';
import categoryRoutes from './category.js';

const router = express.Router();
const SALT_ROUNDS = 12; // Increased from 10 for better security

const normalizeVariationOptionValue = (option) =>
  String((option && typeof option === 'object' ? option.value : option) ?? '').trim();
const normalizeBarcodeCode = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "");

const generateBarcodeCode = () => {
  const base = `${Date.now()}${Math.floor(Math.random() * 900000 + 100000)}`;
  return base.slice(0, 12);
};

const syncProductBarcode = async ({ productId, productTitle, barcode, createdBy }) => {
  const code = normalizeBarcodeCode(barcode);
  if (!code) return null;

  const existing = await Barcode.findOne({ code });
  if (existing && existing.product && existing.product.toString() !== String(productId)) {
    const err = new Error("Barcode already exists");
    err.status = 409;
    throw err;
  }

  const record = await Barcode.findOneAndUpdate(
    { code },
    {
      $set: {
        code,
        label: productTitle || existing?.label || "",
        product: productId,
        productTitle: productTitle || "",
        createdBy: createdBy || existing?.createdBy || null,
        isActive: true,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );

  await Barcode.updateMany(
    { product: productId, code: { $ne: code } },
    { $set: { product: null, productTitle: "" } },
  );
  await Product.updateOne(
    { _id: productId },
    { $set: { barcode: code } },
  );

  return record;
};

const detachBarcodeFromProduct = async (productId, keepCode = null) => {
  const filter = { product: productId };
  if (keepCode) {
    filter.code = { $ne: keepCode };
  }
  await Barcode.updateMany(filter, { $set: { product: null, productTitle: "" } });
  await Product.updateOne({ _id: productId }, { $unset: { barcode: "" } });
};

const createToken = (admin) => {
  const payload = { id: admin._id, role: admin.role, type: 'admin' };
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
};

// --- Cloudinary + upload setup ---
let cloudinaryConfigured = false;
const ensureCloudinaryConfigured = () => {
  if (!cloudinaryConfigured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    cloudinaryConfigured = true;
  }
};
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Middleware to require admin JWT cookie
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    if (payload.type !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const admin = await Admin.findById(payload.id);
    if (!admin) return res.status(403).json({ error: 'Admin not found' });
    if (!admin.isActive) return res.status(403).json({ error: 'Account disabled' });
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin / Moderator registration endpoint has been superseded by manual seeding.
// Keeping route for compatibility, but reject all requests to prevent self-registration.
router.post('/register', async (req, res) => {
  console.warn(`Blocked attempt to access /api/admin/register from IP ${req.ip}`);
  return res.status(403).json({ error: 'Admin registration is disabled. Please contact an existing administrator.' });
});

// Check if email already exists as admin (same email can be user + admin)
// still available even though registration is off
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Only check if already exists as admin (allow same email for user)
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(400).json({ 
        exists: true, 
        error: 'This email is already registered as an admin.'
      });
    }

    res.json({ exists: false, ok: true });
  } catch (err) {
    console.error('Email check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Image/Video upload to Cloudinary (admin-only) — optimized server-side with sharp
router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    ensureCloudinaryConfigured(); // configure on first use
    
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // fail fast if Cloudinary is not configured correctly
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary configuration missing');
      return res.status(500).json({ error: 'Server upload not configured (Cloudinary credentials missing).' });
    }

    // Get folder from request body or query (default to products)
    const folder = req.body.folder || req.query.folder || 'yourhaat/products';
    
    // Detect if file is a video based on mimetype
    const isVideo = req.file.mimetype.startsWith('video/');
    const resourceType = isVideo ? 'video' : 'image';

    // For images: optimize with sharp (resize, rotate, convert to webp)
    if (resourceType === 'image') {
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
        console.error('Sharp image processing error:', sharpErr);
        return res.status(400).json({ error: 'Invalid image file or unsupported format.' });
      }

      const streamUpload = (buffer) =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({
            folder,
            resource_type: 'image'
          }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          });
          stream.end(buffer);
        });

      const result = await streamUpload(optimizedBuffer);
      res.json({ ok: true, asset: {
        public_id: result.public_id,
        url: result.secure_url || result.url,
        width: result.width,
        height: result.height,
        format: result.format,
        resourceType: 'image'
      }});
    } else {
      // For videos: upload directly without processing
      const streamUpload = (buffer) =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({
            folder,
            resource_type: 'video'
          }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          });
          stream.end(buffer);
        });

      const result = await streamUpload(req.file.buffer);
      res.json({ ok: true, asset: {
        public_id: result.public_id,
        url: result.secure_url || result.url,
        width: result.width,
        height: result.height,
        format: result.format,
        duration: result.duration,
        resourceType: 'video'
      }});
    }
  } catch (err) {
    console.error('Upload error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Category routes moved to `routes/category.js`
router.use('/categories', categoryRoutes);

// Public: top-banner + adsense config (no auth — used by frontend)
router.get('/top-banner', async (req, res) => {
  try {
    const SettingModel = (await import('../models/Setting.js')).default;
    const s = await SettingModel.findOne().lean();
    res.json({
      enabled: s?.topBannerEnabled || false,
      html: s?.topBannerEnabled ? (s.topBannerHtml || '') : '',
      config: s?.topBannerEnabled ? (s.topBannerConfig || {}) : {},
      adsenseEnabled: s?.adsenseEnabled || false,
      adsensePublisherId: s?.adsensePublisherId || '',
      adsenseSlot: s?.adsenseSlot || '',
      websiteLogo: s?.websiteLogo || {},
      megaMenuTags: Array.isArray(s?.megaMenuTags) ? s.megaMenuTags : []
    });
  } catch (err) {
    res.json({ enabled: false, html: '', config: {}, adsenseEnabled: false, adsensePublisherId: '', websiteLogo: {}, megaMenuTags: [] });
  }
});

// Settings (admin area)
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    // allow moderators to view settings; only admins may update (enforced on PUT)
    const Setting = (await import('../models/Setting.js')).default;
    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting();
      await settings.save();
    }
    res.json({ settings });
  } catch (err) {
    console.error('GET /settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/settings', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const payload = req.body || {};
    const Setting = (await import('../models/Setting.js')).default;
    const settings = await Setting.findOneAndUpdate({}, { $set: payload }, { upsert: true, new: true });
    res.json({ ok: true, settings });
  } catch (err) {
    console.error('PUT /settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin product management (protected)
router.get('/products', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, q, categoryId, status } = req.query;
    const skip = (Math.max(1, page) - 1) * limit;
    const filter = {};

    if (status === 'draft') {
      filter.status = 'draft';
      filter.createdBy = req.admin._id;
    } else if (status) {
      filter.status = status;
    } else {
      // Default: show published/archived + current admin drafts (no other admin drafts)
      filter.$or = [
        { status: { $ne: 'draft' } },
        { createdBy: req.admin._id }
      ];
    }

    if (categoryId) {
      // accept one id or comma-separated list
      const ids = String(categoryId).split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length === 1) filter.categoryId = ids[0];
      else if (ids.length > 1) filter.categoryId = { $in: ids };
    }
    if (q) filter.$or = [ { title: new RegExp(q, 'i') }, { description: new RegExp(q, 'i') } ];

    const [items, total] = await Promise.all([
      Product.find(filter).sort({ updatedAt: -1 }).skip(Number(skip)).limit(Number(limit)),
      Product.countDocuments(filter)
    ]);
    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('Admin GET /products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Product variation catalog, used by dashboard product forms.
router.get('/variations', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(50, Math.max(1, Number(req.query.per_page || req.query.limit) || 50));
    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      Variation.find({}).sort({ name: 1 }).skip(skip).limit(perPage).lean(),
      Variation.countDocuments({}),
    ]);
    const data = items.map((item) => ({
      id: item._id,
      _id: item._id,
      name: item.name,
      options: (item.options || []).map((option) => ({
        id: option._id,
        _id: option._id,
        value: option.value,
      })),
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
    res.json({
      success: true,
      message: 'Variations retrieved successfully',
      result: {
        data,
        meta: {
          current_page: page,
          from: total ? skip + 1 : null,
          last_page: Math.max(1, Math.ceil(total / perPage)),
          per_page: perPage,
          to: skip + data.length,
          total,
        },
      },
    });
  } catch (err) {
    console.error('Admin GET /variations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/variations', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Variation name is required' });
    const optionValues = Array.isArray(req.body?.options)
      ? req.body.options.map(normalizeVariationOptionValue).filter(Boolean)
      : [];
    const seen = new Set();
    const options = optionValues
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((value) => ({ value }));
    const variation = await Variation.create({ name, options, createdBy: req.admin._id });
    res.json({ ok: true, variation });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Variation already exists' });
    console.error('Admin POST /variations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/variations/:id', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Variation name is required' });
    const optionValues = Array.isArray(req.body?.options)
      ? req.body.options.map(normalizeVariationOptionValue).filter(Boolean)
      : [];
    const seen = new Set();
    const options = optionValues
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((value) => ({ value }));
    const variation = await Variation.findByIdAndUpdate(
      req.params.id,
      { $set: { name, options } },
      { new: true, runValidators: true },
    );
    if (!variation) return res.status(404).json({ error: 'Variation not found' });
    res.json({ ok: true, variation });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Variation already exists' });
    console.error('Admin PUT /variations/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/variations/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await Variation.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Variation not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin DELETE /variations/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/products', requireAdmin, async (req, res) => {
  try {
    let payload = req.body || {};
    const nextBarcode = normalizeBarcodeCode(payload.barcode);

    // ensure drafts and new products are attributed to the current admin
    if (!payload.createdBy) {
      payload.createdBy = req.admin._id;
    }

    // perform a bit of defensive cleanup/validation so the database error is
    // easier for the client to understand.  This mirrors some of the logic
    // already in the front end but ensures the server doesn't crash if a bad
    // payload slips through.

    // parse customization options if they accidentally arrive as a JSON
    // string (happened previously when the schema mis‑interpreted the type)
    if (payload.customization && typeof payload.customization.options === 'string') {
      try {
        payload.customization.options = JSON.parse(payload.customization.options);
      } catch {
        // leave it alone; the validator below will catch it
      }
    }

    // make sure each variant has a numeric price; respond with 400 if not.
    if (Array.isArray(payload.variants)) {
      for (const v of payload.variants) {
        if (v.price == null) {
          return res.status(400).json({ error: 'Each variant must include a price' });
        }
        // cast numeric strings to numbers (express.json already does this for
        // top‑level fields, but nested ones may come through as strings)
        v.price = Number(v.price);
        if (v.inventory != null) v.inventory = Number(v.inventory);
      }
    }

    if (nextBarcode) {
      const [duplicateBarcode, duplicateProduct] = await Promise.all([
        Barcode.findOne({ code: nextBarcode }),
        Product.findOne({ barcode: nextBarcode }).select('_id title'),
      ]);
      if ((duplicateBarcode && duplicateBarcode.product) || duplicateProduct) {
        return res.status(409).json({ error: 'Barcode already exists' });
      }
      payload.barcode = nextBarcode;
    } else {
      delete payload.barcode;
    }

    // If categoryId provided, resolve and store category name on product for backward compatibility
    if (payload.categoryId) {
      try {
        const Category = (await import('../models/Category.js')).default;
        const cat = await Category.findById(payload.categoryId);
        if (cat) payload.category = cat.name;
      } catch (err) {
        // ignore resolution errors
      }
    }

    const p = new Product(payload);
    await p.save();
    if (nextBarcode) {
      try {
        await syncProductBarcode({
          productId: p._id,
          productTitle: p.title,
          barcode: nextBarcode,
          createdBy: req.admin._id,
        });
      } catch (barcodeErr) {
        await Product.deleteOne({ _id: p._id });
        return res.status(barcodeErr.status || 409).json({ error: barcodeErr.message || 'Barcode already exists' });
      }
    }
    res.json({ ok: true, product: p });
  } catch (err) {
    console.error('Admin POST /products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/products/:id', requireAdmin, async (req, res) => {
  try {
    const p = await Product.findById(req.params.id)
      .populate('frequentlyBoughtTogether', 'title price compareAtPrice images slug availability _id');
    if (!p) return res.status(404).json({ error: 'Not found' });
    if (p.status === 'draft' && p.createdBy && p.createdBy.toString() !== req.admin._id.toString()) {
      return res.status(403).json({ error: 'Access denied to this draft' });
    }
    res.json({ product: p });
  } catch (err) {
    console.error('Admin GET /products/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/products/:id', requireAdmin, async (req, res) => {
  try {
    const updates = req.body || {};
    const nextBarcode = normalizeBarcodeCode(updates.barcode);

    // parse stringified customization options if needed
    if (updates.customization && typeof updates.customization.options === 'string') {
      try {
        updates.customization.options = JSON.parse(updates.customization.options);
      } catch {
        // let validation catch it
      }
    }

    // variant sanity check (same as POST)
    if (Array.isArray(updates.variants)) {
      for (const v of updates.variants) {
        if (v.price == null) {
          return res.status(400).json({ error: 'Each variant must include a price' });
        }
        v.price = Number(v.price);
        if (v.inventory != null) v.inventory = Number(v.inventory);
      }
    }

    // Load existing product first so barcode ownership can be validated before updating.
    const existing = await Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    if (nextBarcode) {
      const [duplicateBarcode, duplicateProduct] = await Promise.all([
        Barcode.findOne({ code: nextBarcode }),
        Product.findOne({ barcode: nextBarcode, _id: { $ne: existing._id } }).select('_id title'),
      ]);
      const barcodeOwnedByOtherProduct =
        duplicateBarcode &&
        duplicateBarcode.product &&
        String(duplicateBarcode.product) !== String(existing._id);
      if (barcodeOwnedByOtherProduct || duplicateProduct) {
        return res.status(409).json({ error: 'Barcode already exists' });
      }
      updates.barcode = nextBarcode;
    } else {
      updates.barcode = undefined;
    }

    // If categoryId present, resolve name
    if (updates.categoryId) {
      try {
        const Category = (await import('../models/Category.js')).default;
        const cat = await Category.findById(updates.categoryId);
        if (cat) updates.category = cat.name;
      } catch (err) {
        // ignore
      }
    }

    if (existing.status === 'draft' && existing.createdBy && existing.createdBy.toString() !== req.admin._id.toString()) {
      return res.status(403).json({ error: 'Cannot edit another administrator\'s draft' });
    }

    // Determine images removed by comparing public_id lists
    if (Array.isArray(existing.images) && Array.isArray(updates.images)) {
      const oldIds = existing.images.map(i => i && i.public_id).filter(Boolean);
      const newIds = updates.images.map(i => i && i.public_id).filter(Boolean);
      const removed = oldIds.filter(id => !newIds.includes(id));

      if (removed.length > 0) {
        try {
          ensureCloudinaryConfigured();
          for (const publicId of removed) {
            try {
              console.log('Deleting removed product image from Cloudinary:', publicId);
              await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
            } catch (clErr) {
              console.warn('Cloudinary delete failed for', publicId, clErr && clErr.message ? clErr.message : clErr);
            }
          }
        } catch (e) {
          console.error('Error while removing images from Cloudinary:', e);
        }
      }
    }

    // Apply updates and return updated product
    const p = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!p) return res.status(404).json({ error: 'Not found' });
    if (nextBarcode) {
      await syncProductBarcode({
        productId: p._id,
        productTitle: p.title,
        barcode: nextBarcode,
        createdBy: req.admin._id,
      });
      const oldBarcode = normalizeBarcodeCode(existing.barcode);
      if (oldBarcode && oldBarcode !== nextBarcode) {
        await Barcode.updateOne(
          { code: oldBarcode, product: p._id },
          { $set: { product: null, productTitle: "" } },
        );
      }
    } else {
      await detachBarcodeFromProduct(p._id);
    }
    res.json({ ok: true, product: p });
  } catch (err) {
    console.error('Admin PUT /products/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/products/:id', requireAdmin, async (req, res) => {
  try {
    const force = req.query.force === 'true' || req.query.force === '1';

    if (force) {
      // permanent delete — remove Cloudinary images first
      const p = await Product.findById(req.params.id);
      if (!p) return res.status(404).json({ error: 'Not found' });

      if (Array.isArray(p.images) && p.images.length > 0) {
        try {
          ensureCloudinaryConfigured();
          for (const img of p.images) {
            if (img && img.public_id) {
              try {
                console.log('Deleting product image from Cloudinary (force delete):', img.public_id);
                await cloudinary.uploader.destroy(img.public_id, { resource_type: 'image' });
              } catch (err) {
                console.warn('Failed to delete Cloudinary image', img.public_id, err && err.message ? err.message : err);
              }
            }
          }
        } catch (e) {
          console.error('Cloudinary deletion error during product force-delete:', e);
        }
      }

      await detachBarcodeFromProduct(p._id);
      await Product.deleteOne({ _id: p._id });
      return res.json({ ok: true });
    }

    // soft-delete: set status=archived
    const p = await Product.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
    if (!p) return res.status(404).json({ error: 'Not found' });
    await detachBarcodeFromProduct(p._id);
    res.json({ ok: true, product: p });
  } catch (err) {
    console.error('Admin DELETE /products/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Blog (admin) ---

// List / search blog posts (admin)
router.get('/blog', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, q, status } = req.query;
    const skip = (Math.max(1, page) - 1) * limit;
    const filter = {};
    if (status) filter.status = status;
    if (q) filter.$or = [ { title: new RegExp(q, 'i') }, { excerpt: new RegExp(q, 'i') }, { content: new RegExp(q, 'i') } ];

    const [items, total] = await Promise.all([
      BlogPost.find(filter).populate('categories').sort({ updatedAt: -1 }).skip(Number(skip)).limit(Number(limit)),
      BlogPost.countDocuments(filter)
    ]);
    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('Admin GET /blog error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create post
router.post('/blog', requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const p = new BlogPost(payload);
    await p.save();
    res.json({ ok: true, post: p });
  } catch (err) {
    console.error('Admin POST /blog error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all unique tags from blog posts (must be BEFORE /blog/:id route)
router.get('/blog/tags', requireAdmin, async (req, res) => {
  try {
    const tags = await BlogPost.distinct('tags');
    res.json({ tags: tags.filter(t => t).sort() });
  } catch (err) {
    console.error('Admin GET /blog/tags error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single post (admin)
router.get('/blog/:id', requireAdmin, async (req, res) => {
  try {
    const p = await BlogPost.findById(req.params.id).populate('categories');
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ post: p });
  } catch (err) {
    console.error('Admin GET /blog/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update post
router.put('/blog/:id', requireAdmin, async (req, res) => {
  try {
    const updates = req.body || {};
    if (updates.status === 'published') updates.publishedAt = updates.publishedAt || Date.now();
    const p = await BlogPost.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, post: p });
  } catch (err) {
    console.error('Admin PUT /blog/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete / archive post
router.delete('/blog/:id', requireAdmin, async (req, res) => {
  try {
    const p = await BlogPost.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, post: p });
  } catch (err) {
    console.error('Admin DELETE /blog/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Blog Categories (admin) ---

// List all blog categories
router.get('/blog-categories', requireAdmin, async (req, res) => {
  try {
    const categories = await BlogCategory.find().sort({ name: 1 });
    res.json({ categories });
  } catch (err) {
    console.error('Admin GET /blog-categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create blog category
router.post('/blog-categories', requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    const category = new BlogCategory({ name, description });
    await category.save();
    res.json({ ok: true, category });
  } catch (err) {
    console.error('Admin POST /blog-categories error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Update blog category
router.put('/blog-categories/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    
    const category = await BlogCategory.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json({ ok: true, category });
  } catch (err) {
    console.error('Admin PUT /blog-categories/:id error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete blog category
router.delete('/blog-categories/:id', requireAdmin, async (req, res) => {
  try {
    const category = await BlogCategory.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    
    // Remove category from all blog posts
    await BlogPost.updateMany(
      { categories: req.params.id },
      { $pull: { categories: req.params.id } }
    );
    
    res.json({ ok: true, category });
  } catch (err) {
    console.error('Admin DELETE /blog-categories/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password, adminSecret } = req.body;
    if (!email || !password || !adminSecret) return res.status(400).json({ error: 'Missing fields' });
    
    // Validate admin secret
    if (adminSecret !== process.env.ADMIN_SECRET) {
      console.warn(`Failed admin login attempt from IP ${req.ip} - invalid secret`);
      return res.status(403).json({ error: 'Invalid admin secret' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin || !admin.hashedPassword) {
      console.warn(`Failed admin login attempt from IP ${req.ip} - admin not found: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is active
    if (!admin.isActive) {
      console.warn(`Inactive admin login attempt: ${email}`);
      return res.status(403).json({ error: 'Account is disabled. Contact super admin.' });
    }

    // Check if account is locked
    if (admin.isCurrentlyLocked) {
      const minutesLeft = Math.ceil((admin.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ error: `Account is temporarily locked. Try again in ${minutesLeft} minutes.` });
    }

    // Verify password
    const ok = await bcrypt.compare(password, admin.hashedPassword);
    if (!ok) {
      console.warn(`Failed admin login attempt from IP ${req.ip} - wrong password: ${email}`);
      await admin.incLoginAttempts();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login - reset attempts and update last login info
    await admin.resetLoginAttempts();
    admin.lastLoginAt = Date.now();
    admin.lastLoginIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    await admin.save();

    const token = createToken(admin);
    // SameSite=none + Secure required for cross-origin cookie (Vercel frontend ↔ Render backend)
    res.cookie('token', token, { httpOnly: true, sameSite: 'none', secure: true });
    
    console.log(`Admin logged in: ${admin.email} (${admin.role})`);
    res.json({ user: { email: admin.email, name: admin.name, role: admin.role, image: null } });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Admin accounts management (admin-only) ---

// List all admins/moderators
router.get('/admins', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const items = await Admin.find().select('-hashedPassword -resetToken -resetExpires -loginAttempts');
    res.json({ items });
  } catch (err) {
    console.error('GET /admins error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single admin
router.get('/admins/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const a = await Admin.findById(req.params.id).select('-hashedPassword -resetToken -resetExpires -loginAttempts');
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.json({ admin: a });
  } catch (err) {
    console.error('GET /admins/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new admin (admin-only)
router.post('/admins', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ error: 'Admin with this email already exists' });
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const admin = new Admin({ name, email: email.toLowerCase(), hashedPassword: hashed, role: role === 'moderator' ? 'moderator' : 'admin', isActive: true });
    await admin.save();
    res.json({ ok: true, admin: { email: admin.email, name: admin.name, role: admin.role, _id: admin._id } });
  } catch (err) {
    console.error('POST /admins error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update admin (admin-only)
router.put('/admins/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { name, email, newPassword, role, isActive } = req.body || {};
    const a = await Admin.findById(req.params.id);
    if (!a) return res.status(404).json({ error: 'Not found' });

    if (email && email.toLowerCase() !== a.email) {
      const exists = await Admin.findOne({ email: email.toLowerCase() });
      if (exists) return res.status(400).json({ error: 'Another admin already uses that email' });
      a.email = email.toLowerCase();
    }
    if (name) a.name = name;
    if (typeof isActive === 'boolean') a.isActive = isActive;
    if (role) a.role = role === 'moderator' ? 'moderator' : 'admin';
    if (newPassword) a.hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await a.save();
    res.json({ ok: true, admin: { _id: a._id, name: a.name, email: a.email, role: a.role, isActive: a.isActive } });
  } catch (err) {
    console.error('PUT /admins/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Deactivate admin (admin-only)
router.put('/admins/:id/deactivate', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    if (req.admin._id.toString() === req.params.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
    const a = await Admin.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, admin: { _id: a._id, isActive: a.isActive } });
  } catch (err) {
    console.error('PUT /admins/:id/deactivate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete admin (admin-only)
router.delete('/admins/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    if (req.admin._id.toString() === req.params.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    const a = await Admin.findById(req.params.id);
    if (!a) return res.status(404).json({ error: 'Not found' });
    await Admin.deleteOne({ _id: a._id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /admins/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Customer tag management -----------------------------------------
router.get('/customer-tags', requireAdmin, async (req, res) => {
  try {
    const items = await CustomerTag.find({}).sort({ name: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /customer-tags error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/customer-tags', requireAdmin, async (req, res) => {
  try {
    const { name, color, description } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    const tag = await CustomerTag.create({
      name: String(name).trim(),
      color: color || '#3B82F6',
      description: description || '',
    });
    res.status(201).json({ tag });
  } catch (err) {
    console.error('POST /customer-tags error:', err);
    res.status(500).json({ error: err.code === 11000 ? 'Tag already exists' : 'Server error' });
  }
});

router.put('/customer-tags/:id', requireAdmin, async (req, res) => {
  try {
    const { name, color, description } = req.body || {};
    const tag = await CustomerTag.findById(req.params.id);
    if (!tag) return res.status(404).json({ error: 'Not found' });
    if (typeof name !== 'undefined') tag.name = String(name).trim();
    if (typeof color !== 'undefined') tag.color = color || '#3B82F6';
    if (typeof description !== 'undefined') tag.description = description || '';
    await tag.save();
    res.json({ ok: true, tag });
  } catch (err) {
    console.error('PUT /customer-tags/:id error:', err);
    res.status(500).json({ error: err.code === 11000 ? 'Tag already exists' : 'Server error' });
  }
});

router.delete('/customer-tags/:id', requireAdmin, async (req, res) => {
  try {
    const tag = await CustomerTag.findById(req.params.id);
    if (!tag) return res.status(404).json({ error: 'Not found' });
    await CustomerTag.deleteOne({ _id: tag._id });
    await User.updateMany({ tags: tag._id }, { $pull: { tags: tag._id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /customer-tags/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Barcode management ----------------------------------------------
router.get('/barcodes', requireAdmin, async (req, res) => {
  try {
    const { q = '', code = '', limit = 100, page = 1 } = req.query;
    const filter = {};
    const exactCode = normalizeBarcodeCode(code);
    const searchTerm = String(q || "").trim();
    if (exactCode) {
      filter.code = exactCode;
    } else if (searchTerm) {
      filter.$or = [
        { code: new RegExp(searchTerm, 'i') },
        { label: new RegExp(searchTerm, 'i') },
        { productTitle: new RegExp(searchTerm, 'i') },
      ];
    }
    const skip = (Math.max(1, Number(page)) - 1) * Math.min(500, Number(limit) || 100);
    const pageSize = Math.min(500, Math.max(1, Number(limit) || 100));
    const [items, total] = await Promise.all([
      Barcode.find(filter).populate('product', 'title images barcode sku status').sort({ updatedAt: -1 }).skip(skip).limit(pageSize),
      Barcode.countDocuments(filter),
    ]);
    const normalizedItems = items.map((item) => {
      const linkedBarcode = normalizeBarcodeCode(item.product?.barcode);
      if (!item.product || linkedBarcode !== item.code) {
        return { ...item.toObject(), product: null, productTitle: "" };
      }
      return item.toObject();
    });
    res.json({ items: normalizedItems, total, page: Number(page), limit: pageSize });
  } catch (err) {
    console.error('GET /barcodes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/barcodes', requireAdmin, async (req, res) => {
  try {
    const code = normalizeBarcodeCode(req.body?.code || generateBarcodeCode());
    const label = String(req.body?.label || "").trim();
    const notes = String(req.body?.notes || "").trim();
    const productId = req.body?.product || null;

    const [exists, existingProduct] = await Promise.all([
      Barcode.findOne({ code }),
      productId ? Product.findById(productId).select('_id title barcode') : Promise.resolve(null),
    ]);
    if (exists) return res.status(409).json({ error: 'Barcode already exists' });
    if (productId && !existingProduct) return res.status(404).json({ error: 'Linked product not found' });
    if (productId && existingProduct?.barcode && normalizeBarcodeCode(existingProduct.barcode) !== code) {
      return res.status(409).json({ error: 'Product already has a barcode' });
    }

    const item = await Barcode.create({
      code,
      label,
      notes,
      product: productId || null,
      productTitle: req.body?.productTitle || "",
      createdBy: req.admin._id,
      isActive: true,
    });
    if (productId) {
      await Barcode.updateMany(
        { product: productId, code: { $ne: code } },
        { $set: { product: null, productTitle: "" } },
      );
      await Product.updateOne({ _id: productId }, { $set: { barcode: code } });
    }
    res.status(201).json({ ok: true, item });
  } catch (err) {
    console.error('POST /barcodes error:', err);
    res.status(500).json({ error: err.code === 11000 ? 'Barcode already exists' : 'Server error' });
  }
});

router.put('/barcodes/:id', requireAdmin, async (req, res) => {
  try {
    const item = await Barcode.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    const nextCode = req.body?.code !== undefined ? normalizeBarcodeCode(req.body.code) : item.code;
    if (!nextCode) return res.status(400).json({ error: 'Barcode code is required' });
    const previousCode = item.code;
    const previousProductId = item.product ? String(item.product) : null;

    if (nextCode !== item.code) {
      const duplicate = await Barcode.findOne({ code: nextCode });
      if (duplicate && duplicate._id.toString() !== item._id.toString()) {
        return res.status(409).json({ error: 'Barcode already exists' });
      }
      item.code = nextCode;
    }

    if (req.body?.label !== undefined) item.label = String(req.body.label).trim();
    if (req.body?.notes !== undefined) item.notes = String(req.body.notes).trim();
    if (req.body?.product !== undefined) {
      const nextProductId = req.body.product || null;
      if (nextProductId && String(nextProductId) !== previousProductId) {
        const nextProduct = await Product.findById(nextProductId).select('_id title barcode');
        if (!nextProduct) return res.status(404).json({ error: 'Linked product not found' });
        if (nextProduct.barcode && normalizeBarcodeCode(nextProduct.barcode) !== nextCode) {
          return res.status(409).json({ error: 'Product already has a barcode' });
        }
      }
      item.product = nextProductId;
    }
    if (req.body?.productTitle !== undefined) item.productTitle = String(req.body.productTitle || '').trim();
    if (req.body?.isActive !== undefined) item.isActive = !!req.body.isActive;

    await item.save();
    if (previousProductId && previousProductId !== String(item.product || "")) {
      await Product.updateOne({ _id: previousProductId, barcode: previousCode }, { $unset: { barcode: "" } });
    }
    if (item.product) {
      await Barcode.updateMany(
        { product: item.product, code: { $ne: item.code } },
        { $set: { product: null, productTitle: "" } },
      );
      await Product.updateOne({ _id: item.product }, { $set: { barcode: item.code } });
    }
    await item.populate('product', 'title images barcode sku status');
    res.json({ ok: true, item });
  } catch (err) {
    console.error('PUT /barcodes/:id error:', err);
    res.status(500).json({ error: err.code === 11000 ? 'Barcode already exists' : 'Server error' });
  }
});

router.delete('/barcodes/:id', requireAdmin, async (req, res) => {
  try {
    const item = await Barcode.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.product) {
      await Product.updateOne({ _id: item.product, barcode: item.code }, { $unset: { barcode: "" } });
    }
    await Barcode.deleteOne({ _id: item._id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /barcodes/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- User management -------------------------------------------------
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { q = '', limit = 200 } = req.query;
    const filter = {};
    if (q) filter.$or = [ { email: new RegExp(q, 'i') }, { name: new RegExp(q, 'i') } ];
    const items = await User.find(filter).select('-hashedPassword -resetToken -resetExpires').populate('tags').sort({ createdAt: -1 }).limit(Number(limit));
    res.json({ items });
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single user
router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const u = await User.findById(req.params.id).select('-hashedPassword -resetToken -resetExpires').populate('tags');
    if (!u) return res.status(404).json({ error: 'Not found' });
    res.json({ user: u });
  } catch (err) {
    console.error('GET /users/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { name, isVerified, tags } = req.body || {};
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    if (typeof name !== 'undefined') u.name = name;
    if (typeof isVerified !== 'undefined') u.isVerified = !!isVerified;
    if (Array.isArray(tags)) u.tags = tags.filter(Boolean);
    await u.save();
    await u.populate('tags');
    res.json({ ok: true, user: { _id: u._id, email: u.email, name: u.name, provider: u.provider, isVerified: u.isVerified, createdAt: u.createdAt, tags: u.tags } });
  } catch (err) {
    console.error('PUT /users/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    if (u.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin user' });
    await User.deleteOne({ _id: u._id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /users/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin forgot password - returns token (in prod send an email)
router.post('/forgot', async (req, res) => {
  try {
    const { email, adminSecret } = req.body;
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: 'Invalid admin secret' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      // Don't reveal if admin exists or not
      return res.json({ ok: true, message: 'If account exists, reset token has been generated' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    admin.resetToken = token;
    admin.resetExpires = Date.now() + 1000 * 60 * 30; // 30 minutes
    await admin.save();

    console.log(`Password reset requested for admin: ${email}`);
    // TODO: send email with link containing token
    res.json({ ok: true, token, message: 'Reset token generated' });
  } catch (err) {
    console.error('Admin forgot password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({ resetToken: token, resetExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    user.hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.resetToken = undefined;
    user.resetExpires = undefined;
    user.loginAttempts = 0; // Reset login attempts on password change
    user.isLocked = false;
    user.lockUntil = undefined;
    await user.save();

    console.log(`Password reset completed for admin: ${user.email}`);
    res.json({ ok: true, message: 'Password reset successful' });
  } catch (err) {
    console.error('Admin password reset error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Occasion Sections (admin CRUD) ───────────────────────────────────────────

// GET  /api/admin/occasions  — list all sections sorted by order
router.get('/occasions', requireAdmin, async (req, res) => {
  try {
    const OccasionSection = (await import('../models/OccasionSection.js')).default;
    const items = await OccasionSection.find().sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /occasions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/occasions  — create a new section
router.post('/occasions', requireAdmin, async (req, res) => {
  try {
    const OccasionSection = (await import('../models/OccasionSection.js')).default;
    const payload = req.body || {};
    const last = await OccasionSection.findOne().sort({ order: -1 });
    payload.order = last ? last.order + 1 : 0;
    const section = new OccasionSection(payload);
    await section.save();
    res.json({ ok: true, section });
  } catch (err) {
    console.error('POST /occasions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/occasions/:id  — single section
router.get('/occasions/:id', requireAdmin, async (req, res) => {
  try {
    const OccasionSection = (await import('../models/OccasionSection.js')).default;
    const section = await OccasionSection.findById(req.params.id);
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.json({ section });
  } catch (err) {
    console.error('GET /occasions/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/occasions/:id  — update section (title, cards, isActive, order, etc.)
router.put('/occasions/:id', requireAdmin, async (req, res) => {
  try {
    const OccasionSection = (await import('../models/OccasionSection.js')).default;
    const updates = { ...req.body, updatedAt: Date.now() };
    const section = await OccasionSection.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, section });
  } catch (err) {
    console.error('PUT /occasions/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/occasions/:id  — permanently delete a section
router.delete('/occasions/:id', requireAdmin, async (req, res) => {
  try {
    const OccasionSection = (await import('../models/OccasionSection.js')).default;
    const section = await OccasionSection.findByIdAndDelete(req.params.id);
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /occasions/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/occasions/reorder  — update order for multiple sections at once
// body: [ { _id, order }, … ]
router.put('/occasions-reorder', requireAdmin, async (req, res) => {
  try {
    const OccasionSection = (await import('../models/OccasionSection.js')).default;
    const items = req.body || [];
    await Promise.all(items.map(({ _id, order }) =>
      OccasionSection.findByIdAndUpdate(_id, { order })
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /occasions-reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Featured Sections (admin CRUD) ───────────────────────────────────────────

// GET  /api/admin/featured  — list all featured sections sorted by order
router.get('/featured', requireAdmin, async (req, res) => {
  try {
    const FeaturedSection = (await import('../models/FeaturedSection.js')).default;
    const items = await FeaturedSection.find().sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /featured error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/featured  — create a new featured section
router.post('/featured', requireAdmin, async (req, res) => {
  try {
    const FeaturedSection = (await import('../models/FeaturedSection.js')).default;
    const payload = req.body || {};
    const last = await FeaturedSection.findOne().sort({ order: -1 });
    payload.order = last ? last.order + 1 : 0;
    const section = new FeaturedSection(payload);
    await section.save();
    res.json({ ok: true, section });
  } catch (err) {
    console.error('POST /featured error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/featured/:id  — single featured section
router.get('/featured/:id', requireAdmin, async (req, res) => {
  try {
    const FeaturedSection = (await import('../models/FeaturedSection.js')).default;
    const section = await FeaturedSection.findById(req.params.id);
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.json({ section });
  } catch (err) {
    console.error('GET /featured/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/featured/:id  — update a featured section
router.put('/featured/:id', requireAdmin, async (req, res) => {
  try {
    const FeaturedSection = (await import('../models/FeaturedSection.js')).default;
    const updates = { ...req.body, updatedAt: Date.now() };
    const section = await FeaturedSection.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, section });
  } catch (err) {
    console.error('PUT /featured/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/featured/:id  — permanently delete a featured section
router.delete('/featured/:id', requireAdmin, async (req, res) => {
  try {
    const FeaturedSection = (await import('../models/FeaturedSection.js')).default;
    const section = await FeaturedSection.findByIdAndDelete(req.params.id);
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /featured/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/featured-reorder  — update order for multiple sections at once
// body: [ { _id, order }, … ]
router.put('/featured-reorder', requireAdmin, async (req, res) => {
  try {
    const FeaturedSection = (await import('../models/FeaturedSection.js')).default;
    const items = req.body || [];
    await Promise.all(items.map(({ _id, order }) =>
      FeaturedSection.findByIdAndUpdate(_id, { order })
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /featured-reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Promo Strip Items (admin CRUD) ─────────────────────────────────────────

// GET /api/admin/promo-strip — list all promo strip items sorted by order
router.get('/promo-strip', requireAdmin, async (req, res) => {
  try {
    const PromoStripItem = (await import('../models/PromoStripItem.js')).default;
    const items = await PromoStripItem.find().sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /promo-strip error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/promo-strip — create a new promo strip item
router.post('/promo-strip', requireAdmin, async (req, res) => {
  try {
    const PromoStripItem = (await import('../models/PromoStripItem.js')).default;
    const payload = req.body || {};
    const last = await PromoStripItem.findOne().sort({ order: -1 });
    payload.order = last ? last.order + 1 : 0;
    const item = new PromoStripItem(payload);
    await item.save();
    res.json({ ok: true, item });
  } catch (err) {
    console.error('POST /promo-strip error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/promo-strip/:id — single promo strip item
router.get('/promo-strip/:id', requireAdmin, async (req, res) => {
  try {
    const PromoStripItem = (await import('../models/PromoStripItem.js')).default;
    const item = await PromoStripItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ item });
  } catch (err) {
    console.error('GET /promo-strip/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/promo-strip/:id — update promo strip item
router.put('/promo-strip/:id', requireAdmin, async (req, res) => {
  try {
    const PromoStripItem = (await import('../models/PromoStripItem.js')).default;
    const updates = { ...req.body, updatedAt: Date.now() };
    const item = await PromoStripItem.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    console.error('PUT /promo-strip/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/promo-strip/:id — delete promo strip item
router.delete('/promo-strip/:id', requireAdmin, async (req, res) => {
  try {
    const PromoStripItem = (await import('../models/PromoStripItem.js')).default;
    const item = await PromoStripItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /promo-strip/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/promo-strip-reorder — batch update order
// body: [ { _id, order }, … ]
router.put('/promo-strip-reorder', requireAdmin, async (req, res) => {
  try {
    const PromoStripItem = (await import('../models/PromoStripItem.js')).default;
    const items = req.body || [];
    await Promise.all(items.map(({ _id, order }) =>
      PromoStripItem.findByIdAndUpdate(_id, { order })
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /promo-strip-reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Banners (admin CRUD) ─────────────────────────────────────────────────────

router.get('/banners', requireAdmin, async (req, res) => {
  try {
    const Banner = (await import('../models/Banner.js')).default;
    const items = await Banner.find().sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /banners error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/banners', requireAdmin, async (req, res) => {
  try {
    const Banner = (await import('../models/Banner.js')).default;
    const payload = req.body || {};
    const last = await Banner.findOne().sort({ order: -1 });
    payload.order = last ? last.order + 1 : 0;
    const banner = new Banner(payload);
    await banner.save();
    res.json({ ok: true, banner });
  } catch (err) {
    console.error('POST /banners error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/banners/:id', requireAdmin, async (req, res) => {
  try {
    const Banner = (await import('../models/Banner.js')).default;
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ error: 'Not found' });
    res.json({ banner });
  } catch (err) {
    console.error('GET /banners/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/banners/:id', requireAdmin, async (req, res) => {
  try {
    const Banner = (await import('../models/Banner.js')).default;
    const updates = { ...req.body, updatedAt: Date.now() };
    const banner = await Banner.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!banner) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, banner });
  } catch (err) {
    console.error('PUT /banners/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/banners/:id', requireAdmin, async (req, res) => {
  try {
    const Banner = (await import('../models/Banner.js')).default;
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ error: 'Not found' });
    // optionally remove from Cloudinary
    if (banner.image?.public_id) {
      try {
        ensureCloudinaryConfigured();
        await cloudinary.uploader.destroy(banner.image.public_id, { resource_type: 'image' });
      } catch (e) { console.warn('Cloudinary delete failed for banner image:', e?.message); }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /banners/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/banners-reorder', requireAdmin, async (req, res) => {
  try {
    const Banner = (await import('../models/Banner.js')).default;
    const items = req.body || [];
    await Promise.all(items.map(({ _id, order }) =>
      Banner.findByIdAndUpdate(_id, { order })
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /banners-reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Promo Panels (admin CRUD – for Popular Picks left panel) ────────────────

router.get('/promo-panels', requireAdmin, async (req, res) => {
  try {
    const PromoPanel = (await import('../models/PromoPanel.js')).default;
    const items = await PromoPanel.find().sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /promo-panels error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/promo-panels', requireAdmin, async (req, res) => {
  try {
    const PromoPanel = (await import('../models/PromoPanel.js')).default;
    const payload = req.body || {};
    const last = await PromoPanel.findOne().sort({ order: -1 });
    payload.order = last ? last.order + 1 : 0;
    const panel = new PromoPanel(payload);
    await panel.save();
    res.json({ ok: true, panel });
  } catch (err) {
    console.error('POST /promo-panels error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/promo-panels/:id', requireAdmin, async (req, res) => {
  try {
    const PromoPanel = (await import('../models/PromoPanel.js')).default;
    const panel = await PromoPanel.findById(req.params.id);
    if (!panel) return res.status(404).json({ error: 'Not found' });
    res.json({ panel });
  } catch (err) {
    console.error('GET /promo-panels/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/promo-panels/:id', requireAdmin, async (req, res) => {
  try {
    const PromoPanel = (await import('../models/PromoPanel.js')).default;
    const updates = { ...req.body, updatedAt: Date.now() };
    const panel = await PromoPanel.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!panel) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, panel });
  } catch (err) {
    console.error('PUT /promo-panels/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/promo-panels/:id', requireAdmin, async (req, res) => {
  try {
    const PromoPanel = (await import('../models/PromoPanel.js')).default;
    const panel = await PromoPanel.findByIdAndDelete(req.params.id);
    if (!panel) return res.status(404).json({ error: 'Not found' });
    if (panel.image?.public_id) {
      try {
        ensureCloudinaryConfigured();
        await cloudinary.uploader.destroy(panel.image.public_id, { resource_type: 'image' });
      } catch (e) { console.warn('Cloudinary delete failed for promo panel image:', e?.message); }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /promo-panels/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/promo-panels-reorder', requireAdmin, async (req, res) => {
  try {
    const PromoPanel = (await import('../models/PromoPanel.js')).default;
    const items = req.body || [];
    await Promise.all(items.map(({ _id, order }) =>
      PromoPanel.findByIdAndUpdate(_id, { order })
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /promo-panels-reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Popup (admin CRUD – singleton) ──────────────────────────────────────────

// GET current popup settings
router.get('/popup', requireAdmin, async (req, res) => {
  try {
    const Popup = (await import('../models/Popup.js')).default;
    const popup = await Popup.findOne();
    res.json({ popup: popup || null });
  } catch (err) {
    console.error('GET /popup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT (upsert) popup settings
router.put('/popup', requireAdmin, async (req, res) => {
  try {
    const Popup = (await import('../models/Popup.js')).default;
    const { image, link, isActive } = req.body;
    let popup = await Popup.findOne();
    if (popup) {
      if (image !== undefined) popup.image = image;
      if (link !== undefined) popup.link = link;
      if (isActive !== undefined) popup.isActive = isActive;
      await popup.save();
    } else {
      popup = await new Popup({ image, link, isActive }).save();
    }
    res.json({ ok: true, popup });
  } catch (err) {
    console.error('PUT /popup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE popup image (reset to empty)
router.delete('/popup', requireAdmin, async (req, res) => {
  try {
    const Popup = (await import('../models/Popup.js')).default;
    const popup = await Popup.findOne();
    if (popup?.image?.public_id) {
      try {
        ensureCloudinaryConfigured();
        await cloudinary.uploader.destroy(popup.image.public_id, { resource_type: 'image' });
      } catch (e) { console.warn('Cloudinary delete failed for popup image:', e?.message); }
    }
    await Popup.deleteMany();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /popup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Media Library (Cloudinary) ────────────────────────────────────────────────

// GET /api/admin/media?folder=&next_cursor=&q=
// Lists images stored in Cloudinary (up to 60 per page)
router.get('/media', requireAdmin, async (req, res) => {
  try {
    ensureCloudinaryConfigured();
    const { folder = '', next_cursor, q } = req.query;

    const opts = {
      type: 'upload',
      resource_type: 'image',
      max_results: 60,
    };
    if (folder) opts.prefix = folder;
    if (next_cursor) opts.next_cursor = next_cursor;

    const result = await cloudinary.api.resources(opts);

    let resources = result.resources || [];

    // client-side name filter (Cloudinary doesn't support full-text search on free tier)
    if (q) {
      const lower = q.toLowerCase();
      resources = resources.filter(r =>
        r.public_id.toLowerCase().includes(lower)
      );
    }

    res.json({
      items: resources.map(r => ({
        public_id: r.public_id,
        url: r.secure_url || r.url,
        width: r.width,
        height: r.height,
        bytes: r.bytes,
        format: r.format,
        created_at: r.created_at,
        folder: r.folder || r.public_id.split('/').slice(0, -1).join('/'),
      })),
      next_cursor: result.next_cursor || null,
    });
  } catch (err) {
    console.error('GET /media error:', err);
    res.status(500).json({ error: err.message || 'Cloudinary error' });
  }
});

// GET /api/admin/media/folders  — list all folder prefixes found across uploaded assets
router.get('/media/folders', requireAdmin, async (req, res) => {
  try {
    ensureCloudinaryConfigured();
    const result = await cloudinary.api.root_folders();
    const folders = (result.folders || []).map(f => f.path);
    res.json({ folders });
  } catch (err) {
    // non-fatal — return empty list
    res.json({ folders: [] });
  }
});

// DELETE /api/admin/media  — delete one or more images from Cloudinary
// body: { public_ids: ['folder/name', ...] }
router.delete('/media', requireAdmin, async (req, res) => {
  try {
    ensureCloudinaryConfigured();
    const { public_ids } = req.body || {};
    if (!Array.isArray(public_ids) || public_ids.length === 0) {
      return res.status(400).json({ error: 'public_ids array required' });
    }
    const result = await cloudinary.api.delete_resources(public_ids, { resource_type: 'image' });
    res.json({ ok: true, deleted: result.deleted });
  } catch (err) {
    console.error('DELETE /media error:', err);
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

// ─── Discounts / Offers (admin CRUD) ─────────────────────────────────────────

router.get('/discounts', requireAdmin, async (req, res) => {
  try {
    const Discount = (await import('../models/Discount.js')).default;
    const items = await Discount.find().sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /discounts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/discounts', requireAdmin, async (req, res) => {
  try {
    const Discount = (await import('../models/Discount.js')).default;
    const payload = req.body || {};
    const last = await Discount.findOne().sort({ order: -1 });
    payload.order = last ? last.order + 1 : 0;
    const item = new Discount(payload);
    await item.save();
    res.json({ ok: true, item });
  } catch (err) {
    console.error('POST /discounts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/discounts-reorder', requireAdmin, async (req, res) => {
  try {
    const Discount = (await import('../models/Discount.js')).default;
    const items = req.body || [];
    await Promise.all(items.map(({ _id, order }) => Discount.findByIdAndUpdate(_id, { order })));
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /discounts-reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/discounts/:id', requireAdmin, async (req, res) => {
  try {
    const Discount = (await import('../models/Discount.js')).default;
    const updates = { ...req.body, updatedAt: Date.now() };
    const item = await Discount.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    console.error('PUT /discounts/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/discounts/:id', requireAdmin, async (req, res) => {
  try {
    const Discount = (await import('../models/Discount.js')).default;
    const item = await Discount.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /discounts/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Waitlist routes
router.get('/waitlist', requireAdmin, async (req, res) => {
  try {
    const Waitlist = (await import('../models/Waitlist.js')).default;
    const { productId, notified } = req.query;
    const filter = {};
    if (productId) filter.productId = productId;
    if (notified !== undefined) filter.notified = notified === 'true';
    const entries = await Waitlist.find(filter).sort({ createdAt: -1 });
    res.json({ entries });
  } catch (err) {
    console.error('GET /waitlist error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/waitlist/:id/notified', requireAdmin, async (req, res) => {
  try {
    const Waitlist = (await import('../models/Waitlist.js')).default;
    const entry = await Waitlist.findByIdAndUpdate(req.params.id, { notified: true }, { new: true });
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, entry });
  } catch (err) {
    console.error('PUT /waitlist/:id/notified error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/waitlist/:id', requireAdmin, async (req, res) => {
  try {
    const Waitlist = (await import('../models/Waitlist.js')).default;
    const entry = await Waitlist.findByIdAndDelete(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /waitlist/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Admin Orders ─────────────────────────────────────────────────────────────

// GET /api/admin/dashboard-overview
router.get('/dashboard-overview', requireAdmin, async (req, res) => {
  try {
    const now = new Date();

    const startOfDay = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const addDays = (date, days) => {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d;
    };

    const todayStart = startOfDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const yesterdayStart = addDays(todayStart, -1);
    const last7Start = addDays(todayStart, -6);
    const last30Start = addDays(todayStart, -29);

    const summarizeRange = async (start, end) => {
      const match = { createdAt: { $gte: start, $lt: end } };
      const [count, salesAgg, profitAgg, pending] = await Promise.all([
        Order.countDocuments(match),
        Order.aggregate([
          { $match: { ...match, status: { $nin: ['cancelled', 'failed'] } } },
          { $group: { _id: null, total: { $sum: '$total' } } },
        ]),
        Order.aggregate([
          { $match: { ...match, status: { $nin: ['cancelled', 'failed'] } } },
          { $group: { _id: null, total: { $sum: { $subtract: ['$subtotal', '$discount'] } } } },
        ]),
        Order.countDocuments({ ...match, status: 'pending' }),
      ]);

      return {
        orders: count,
        sales: salesAgg[0]?.total || 0,
        profit: profitAgg[0]?.total || 0,
        pending,
      };
    };

    const [
      totalOrders,
      pendingOrders,
      processingOrders,
      statusCountsAgg,
      salesAgg,
      profitAgg,
      recentOrders,
      unpaidOnlineOrders,
      todaySummary,
      yesterdaySummary,
      last7Summary,
      last30Summary,
      topProductsAgg,
      hourlyRevenueAgg,
      trackedProducts,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'processing' }),
      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { status: { $nin: ['cancelled', 'failed'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { status: { $nin: ['cancelled', 'failed'] } } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$subtotal', '$discount'] } } } },
      ]),
      Order.find({}).sort({ createdAt: -1 }).limit(8).lean(),
      Order.countDocuments({ paymentMethod: { $in: ['online', 'bkash'] }, paymentStatus: 'unpaid' }),
      summarizeRange(todayStart, tomorrowStart),
      summarizeRange(yesterdayStart, todayStart),
      summarizeRange(last7Start, tomorrowStart),
      summarizeRange(last30Start, tomorrowStart),
      Order.aggregate([
        { $match: { createdAt: { $gte: last30Start, $lt: tomorrowStart }, status: { $nin: ['cancelled', 'failed'] } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            title: { $first: '$items.title' },
            unitsSold: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          },
        },
        { $sort: { unitsSold: -1, revenue: -1 } },
        { $limit: 8 },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: todayStart, $lt: tomorrowStart }, status: { $nin: ['cancelled', 'failed'] } } },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            revenue: { $sum: '$total' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Product.find({ status: { $ne: 'archived' } })
        .select('title inventory variants updatedAt')
        .lean(),
    ]);

    const statusCounts = statusCountsAgg.reduce((acc, row) => {
      if (row?._id) acc[row._id] = row.count;
      return acc;
    }, {});

    const hourlyMap = hourlyRevenueAgg.reduce((acc, row) => {
      acc[row._id] = { revenue: row.revenue || 0, orders: row.orders || 0 };
      return acc;
    }, {});

    const hourlyRevenue = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue: hourlyMap[hour]?.revenue || 0,
      orders: hourlyMap[hour]?.orders || 0,
    }));

    const lowStockThreshold = 5;
    const stockRows = trackedProducts.map((product) => {
      const variantTotal = Array.isArray(product.variants) && product.variants.length
        ? product.variants.reduce((sum, variant) => sum + (Number(variant.inventory) || 0), 0)
        : null;
      const totalInventory = variantTotal !== null ? variantTotal : (Number(product.inventory) || 0);

      return {
        _id: product._id,
        title: product.title,
        totalInventory,
        updatedAt: product.updatedAt,
      };
    });

    const outOfStock = stockRows
      .filter((row) => row.totalInventory <= 0)
      .sort((a, b) => a.totalInventory - b.totalInventory)
      .slice(0, 8);

    const lowStock = stockRows
      .filter((row) => row.totalInventory > 0 && row.totalInventory <= lowStockThreshold)
      .sort((a, b) => a.totalInventory - b.totalInventory)
      .slice(0, 8);

    res.json({
      overview: {
        totalOrders,
        totalSales: salesAgg[0]?.total || 0,
        totalProfit: profitAgg[0]?.total || 0,
        pendingOrders,
      },
      reports: {
        today: todaySummary,
        yesterday: yesterdaySummary,
        last7Days: last7Summary,
        last30Days: last30Summary,
      },
      orderFlow: {
        created: totalOrders,
        pending: statusCounts.pending || 0,
        confirmed: statusCounts.confirmed || 0,
        processing: statusCounts.processing || 0,
        sentToCourier: statusCounts.shipped || 0,
        delivered: statusCounts.delivered || 0,
        cancelled: statusCounts.cancelled || 0,
        failed: statusCounts.failed || 0,
      },
      recentOrders,
      topSellingProducts: topProductsAgg,
      hourlyRevenue,
      stock: {
        threshold: lowStockThreshold,
        outOfStockCount: stockRows.filter((row) => row.totalInventory <= 0).length,
        lowStockCount: stockRows.filter((row) => row.totalInventory > 0 && row.totalInventory <= lowStockThreshold).length,
        outOfStock,
        lowStock,
      },
      actionCenter: {
        pendingOrders,
        processingOrders,
        unpaidOnlineOrders,
        lowStockCount: stockRows.filter((row) => row.totalInventory > 0 && row.totalInventory <= lowStockThreshold).length,
      },
      generatedAt: now,
    });
  } catch (err) {
    console.error('GET /admin/dashboard-overview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/orders
router.get('/orders', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, paymentStatus, paymentMethod, q } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (paymentStatus && paymentStatus !== 'all') filter.paymentStatus = paymentStatus;
    if (paymentMethod && paymentMethod !== 'all') filter.paymentMethod = paymentMethod;
    if (q) {
      filter.$or = [
        { _id: q.match(/^[a-f\d]{24}$/i) ? q : null },
        { 'billingDetails.name': { $regex: q, $options: 'i' } },
        { 'billingDetails.phone': { $regex: q, $options: 'i' } },
        { userEmail: { $regex: q, $options: 'i' } },
        { transactionId: { $regex: q, $options: 'i' } },
      ].filter(c => Object.values(c)[0] !== null);
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Order.countDocuments(filter),
    ]);
    // Summary counts
    const [pending, confirmed, processing, shipped, delivered, cancelled, failed] = await Promise.all([
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'confirmed' }),
      Order.countDocuments({ status: 'processing' }),
      Order.countDocuments({ status: 'shipped' }),
      Order.countDocuments({ status: 'delivered' }),
      Order.countDocuments({ status: 'cancelled' }),
      Order.countDocuments({ status: 'failed' }),
    ]);
    const revenueAgg = await Order.aggregate([
      { $match: { status: { $nin: ['cancelled', 'failed'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    res.json({
      orders,
      total,
      pages: Math.ceil(total / parseInt(limit)),
      stats: {
        all: total,
        pending, confirmed, processing, shipped, delivered, cancelled, failed,
        revenue: revenueAgg[0]?.total || 0,
      },
    });
  } catch (err) {
    console.error('GET /admin/orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/orders/:id
router.get('/orders/:id', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    console.error('GET /admin/orders/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/orders/:id/status
router.put('/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const VALID = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'failed', 'cancelled'];
    const { status } = req.body;
    if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    console.error('PUT /admin/orders/:id/status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/orders/:id/payment-status
router.put('/orders/:id/payment-status', requireAdmin, async (req, res) => {
  try {
    const VALID = ['unpaid', 'cod', 'paid', 'failed', 'cancelled'];
    const { paymentStatus } = req.body;
    if (!VALID.includes(paymentStatus)) return res.status(400).json({ error: 'Invalid payment status' });
    const order = await Order.findByIdAndUpdate(req.params.id, { paymentStatus }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    console.error('PUT /admin/orders/:id/payment-status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/orders/:id
router.delete('/orders/:id', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /admin/orders/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
