import express from 'express';
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
    if (categoryId) filter.categoryId = categoryId;
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
    // build tree
    const map = new Map();
    cats.forEach(c => map.set(String(c._id), { _id: c._id, name: c.name, parent: c.parent ? String(c.parent) : null, level: c.level, children: [] }));
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
