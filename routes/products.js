import express from 'express';
import jwt from 'jsonwebtoken';
import Product from '../models/Product.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';

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

const router = express.Router();

// Public product listing with pagination, search, category filter
router.get('/', async (req, res) => {
  try {
    const { q, categoryId, page = 1, limit = 20, status = 'published' } = req.query;
    const skip = (Math.max(1, page) - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (categoryId) {
      // allow comma-separated list of ids
      const ids = String(categoryId).split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length === 1) filter.categoryId = ids[0];
      else if (ids.length > 1) filter.categoryId = { $in: ids };
    }
    if (q) filter.$or = [
      { title: new RegExp(q, 'i') },
      { description: new RegExp(q, 'i') },
      { tags: new RegExp(q, 'i') }
    ];

    const [items, total] = await Promise.all([
      Product.find(filter).sort({ updatedAt: -1 }).skip(Number(skip)).limit(Number(limit)),
      Product.countDocuments(filter)
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('GET /api/products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public categories listing (tree-friendly)
router.get('/categories', async (req, res) => {
  try {
    const Category = (await import('../models/Category.js')).default;
    const cats = await Category.find({ isActive: true }).sort({ level: 1, order: 1, name: 1 });
    // build tree — include slug, order and images for client display
    const map = new Map();
    cats.forEach(c => map.set(String(c._id), { _id: c._id, name: c.name, slug: c.slug, parent: c.parent ? String(c.parent) : null, level: c.level, order: c.order, images: c.images || [], children: [] }));
    const roots = [];
    for (const node of map.values()) {
      if (node.parent && map.has(node.parent)) map.get(node.parent).children.push(node);
      else roots.push(node);
    }
    res.json({ categories: roots });
  } catch (err) {
    console.error('GET /api/products/categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: get ALL reviews across all products (dashboard)
router.get('/admin-reviews', requireAdmin, async (req, res) => {
  try {
    const products = await Product.find({ 'reviews.0': { $exists: true } }, 'title reviews categoryId').lean();
    const rows = [];
    products.forEach(p => {
      (p.reviews || []).forEach((r, idx) => {
        rows.push({ productId: p._id, productTitle: p.title, categoryId: p.categoryId, index: idx, ...r });
      });
    });
    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, rows });
  } catch (err) {
    console.error('GET /api/products/admin-reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: 'Not found' });
    res.json({ product: prod });
  } catch (err) {
    console.error('GET /api/products/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Middleware: logged-in user (regular user JWT)
async function requireUser(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Please login first to submit a review.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    if (payload.type === 'admin') return res.status(403).json({ error: 'Use a customer account to submit reviews.' });
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(payload.id).select('name email role');
    if (!user) return res.status(401).json({ error: 'User not found.' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid session. Please login again.' });
  }
}

// Middleware: admin/moderator only
async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    if (payload.type !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const Admin = (await import('../models/Admin.js')).default;
    const admin = await Admin.findById(payload.id);
    if (!admin || !admin.isActive) return res.status(403).json({ error: 'Admin not found or disabled' });
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Submit a review (must be logged-in user)
router.post('/:id/reviews', requireUser, async (req, res) => {
  try {
    const { authorName, rating, body } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating (1-5) is required' });
    if (!body?.trim()) return res.status(400).json({ error: 'Review comment is required' });
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    const displayName = authorName?.trim() || req.user.name || req.user.email.split('@')[0];
    prod.reviews.push({ user: req.user._id, authorName: displayName, rating: Number(rating), body: body.trim(), createdAt: new Date() });
    await prod.save();
    res.json({ ok: true, reviews: prod.reviews, averageRating: prod.averageRating, reviewCount: prod.reviewCount });
  } catch (err) {
    console.error('POST /api/products/:id/reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit a review (must be the review's owner)
router.put('/:id/reviews/:index', requireUser, async (req, res) => {
  try {
    const { authorName, rating, body } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating (1-5) is required' });
    if (!body?.trim()) return res.status(400).json({ error: 'Review comment is required' });
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    const idx = Number(req.params.index);
    if (idx < 0 || idx >= prod.reviews.length) return res.status(404).json({ error: 'Review not found' });
    const review = prod.reviews[idx];
    if (review.user?.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'You can only edit your own reviews.' });
    review.authorName = authorName?.trim() || req.user.name || req.user.email.split('@')[0];
    review.rating = Number(rating);
    review.body = body.trim();
    await prod.save();
    res.json({ ok: true, reviews: prod.reviews, averageRating: prod.averageRating, reviewCount: prod.reviewCount });
  } catch (err) {
    console.error('PUT /api/products/:id/reviews/:index error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a review (admin/moderator only)
router.delete('/:id/reviews/:index', requireAdmin, async (req, res) => {
  try {
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    const idx = Number(req.params.index);
    if (idx < 0 || idx >= prod.reviews.length) return res.status(404).json({ error: 'Review not found' });
    prod.reviews.splice(idx, 1);
    await prod.save();
    res.json({ ok: true, reviews: prod.reviews, averageRating: prod.averageRating, reviewCount: prod.reviewCount });
  } catch (err) {
    console.error('DELETE /api/products/:id/reviews/:index error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: edit any review (no ownership check)
router.put('/admin-reviews/:productId/:index', requireAdmin, async (req, res) => {
  try {
    const { rating, body } = req.body;
    const prod = await Product.findById(req.params.productId);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    const idx = Number(req.params.index);
    if (idx < 0 || idx >= prod.reviews.length) return res.status(404).json({ error: 'Review not found' });
    if (rating !== undefined) prod.reviews[idx].rating = Number(rating);
    if (body !== undefined) prod.reviews[idx].body = body;
    await prod.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/products/admin-reviews/:productId/:index error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit a question
router.post('/:id/questions', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'Question is required' });
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    prod.faqs.push({ question: question.trim(), answer: '' });
    await prod.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/products/:id/questions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload image (optimized server-side) - returns Cloudinary asset
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    ensureCloudinaryConfigured(); // configure on first use
    
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary configuration missing');
      return res.status(500).json({ error: 'Server upload not configured (Cloudinary credentials missing).' });
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
      console.error('Sharp image processing error:', sharpErr);
      return res.status(400).json({ error: 'Invalid image file or unsupported format.' });
    }

    const streamUpload = (buffer) =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          folder: process.env.CLOUDINARY_FOLDER || 'yourhaat/products',
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
      format: result.format
    } });
  } catch (err) {
    console.error('POST /api/products/upload error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

export default router;
