import express from 'express';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import Product from '../models/Product.js';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

// --- Cloudinary helper (local copy to avoid circular imports) ---
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

// Middleware to require admin JWT cookie (copied from admin.js to keep router standalone)
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

// --- Category management (admin-only) ---
router.get('/', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const Category = (await import('../models/Category.js')).default;
    const items = await Category.find().sort({ level: 1, order: 1, name: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create category (max 5 subcategories per parent)
router.post('/', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { name, parentId, order } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const Category = (await import('../models/Category.js')).default;

    let level = 0;
    if (parentId) {
      const parent = await Category.findById(parentId);
      if (!parent) return res.status(400).json({ error: 'Parent category not found' });
      const childCount = await Category.countDocuments({ parent: parentId });
      if (childCount >= 5) return res.status(400).json({ error: 'A category may have at most 5 subcategories' });
      level = parent.level + 1;
    }

    const cat = new (await import('../models/Category.js')).default({ name, parent: parentId || undefined, level, order: order || 0, isActive: true });

    // allow initial images array (frontend should upload to /api/admin/upload first)
    if (Array.isArray(req.body.images)) cat.images = req.body.images;

    await cat.save();
    res.json({ ok: true, category: cat });
  } catch (err) {
    console.error('POST /categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update category
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { name, parentId, order, isActive, images } = req.body || {};
    const Category = (await import('../models/Category.js')).default;
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });

    // handle parent change
    if (parentId && parentId !== String(cat.parent)) {
      const newParent = await Category.findById(parentId);
      if (!newParent) return res.status(400).json({ error: 'Parent not found' });
      const childCount = await Category.countDocuments({ parent: parentId });
      if (childCount >= 5) return res.status(400).json({ error: 'A category may have at most 5 subcategories' });
      cat.parent = parentId;
      cat.level = newParent.level + 1;
    }

    // process image removals (delete from Cloudinary if public_id removed)
    if (Array.isArray(cat.images) && Array.isArray(images)) {
      const oldIds = cat.images.map(i => i && i.public_id).filter(Boolean);
      const newIds = images.map(i => i && i.public_id).filter(Boolean);
      const removed = oldIds.filter(id => !newIds.includes(id));
      if (removed.length > 0) {
        try {
          ensureCloudinaryConfigured();
          for (const publicId of removed) {
            try {
              console.log('Deleting removed category image from Cloudinary:', publicId);
              await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
            } catch (clErr) {
              console.warn('Cloudinary delete failed for', publicId, clErr && clErr.message ? clErr.message : clErr);
            }
          }
        } catch (e) {
          console.error('Error while removing category images from Cloudinary:', e);
        }
      }
    }

    if (name) cat.name = name;
    if (typeof isActive === 'boolean') cat.isActive = isActive;
    if (typeof order !== 'undefined') cat.order = order;

    // accept images array when provided (frontend uploads images separately to /admin/upload)
    if (Array.isArray(images)) cat.images = images;

    await cat.save();
    res.json({ ok: true, category: cat });
  } catch (err) {
    console.error('PUT /categories/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete category (only if no children and no products assigned) - otherwise deactivate
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const Category = (await import('../models/Category.js')).default;
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });
    const child = await Category.findOne({ parent: cat._id });
    if (child) return res.status(400).json({ error: 'Category has subcategories; remove them first or deactivate instead' });
    const product = await Product.findOne({ categoryId: cat._id });
    if (product) return res.status(400).json({ error: 'Category is used by products; cannot delete' });
    await cat.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /categories/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
