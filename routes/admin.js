import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import Admin from '../models/Admin.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import BlogPost from '../models/BlogPost.js';
import sharp from 'sharp';

const router = express.Router();
const SALT_ROUNDS = 12; // Increased from 10 for better security

const createToken = (admin) => {
  const payload = { id: admin._id, role: admin.role, type: 'admin' };
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
};

// --- Cloudinary + upload setup ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
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

// Admin / Moderator registration (only via admin secret)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, adminSecret, role } = req.body;
    if (!name || !email || !password || !adminSecret) return res.status(400).json({ error: 'Missing fields' });
    
    // Validate admin secret
    if (adminSecret !== process.env.ADMIN_SECRET) {
      console.warn(`Failed admin registration attempt from IP ${req.ip} - invalid secret`);
      return res.status(403).json({ error: 'Invalid admin secret' });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if this email already exists as admin (separate from User collection)
    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'This email is already registered as an admin. Use admin login instead.' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const admin = new Admin({ 
      name, 
      email: email.toLowerCase(), 
      hashedPassword: hashed, 
      role: role === 'moderator' ? 'moderator' : 'admin',
      isActive: true
    });
    await admin.save();

    console.log(`New ${admin.role} registered: ${admin.email}`);
    res.json({ ok: true, user: { email: admin.email, name: admin.name, role: admin.role } });
  } catch (err) {
    console.error('Admin registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if email already exists as admin (same email can be user + admin)
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

// Image upload to Cloudinary (admin-only) — optimized server-side with sharp
router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const maxWidth = Number(process.env.IMG_MAX_WIDTH) || 1600;
    const quality = Number(process.env.IMG_QUALITY) || 75;

    // optimize image with sharp (resize, rotate, convert to webp)
    const optimizedBuffer = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

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
    }});
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// --- Category management (admin-only) ---
router.get('/categories', requireAdmin, async (req, res) => {
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
router.post('/categories', requireAdmin, async (req, res) => {
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

    const cat = new Category({ name, parent: parentId || undefined, level, order: order || 0, isActive: true });
    await cat.save();
    res.json({ ok: true, category: cat });
  } catch (err) {
    console.error('POST /categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update category
router.put('/categories/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { name, parentId, order, isActive } = req.body || {};
    const Category = (await import('../models/Category.js')).default;
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });

    if (parentId && parentId !== String(cat.parent)) {
      const newParent = await Category.findById(parentId);
      if (!newParent) return res.status(400).json({ error: 'Parent not found' });
      const childCount = await Category.countDocuments({ parent: parentId });
      if (childCount >= 5) return res.status(400).json({ error: 'A category may have at most 5 subcategories' });
      cat.parent = parentId;
      cat.level = newParent.level + 1;
    }
    if (name) cat.name = name;
    if (typeof isActive === 'boolean') cat.isActive = isActive;
    if (typeof order !== 'undefined') cat.order = order;
    await cat.save();
    res.json({ ok: true, category: cat });
  } catch (err) {
    console.error('PUT /categories/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete category (only if no children and no products assigned) - otherwise deactivate
router.delete('/categories/:id', requireAdmin, async (req, res) => {
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
    if (status) filter.status = status;
    if (categoryId) filter.categoryId = categoryId;
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

router.post('/products', requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};

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
    res.json({ ok: true, product: p });
  } catch (err) {
    console.error('Admin POST /products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/products/:id', requireAdmin, async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ product: p });
  } catch (err) {
    console.error('Admin GET /products/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/products/:id', requireAdmin, async (req, res) => {
  try {
    const updates = req.body || {};

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

    const p = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!p) return res.status(404).json({ error: 'Not found' });
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
      // permanent delete
      const p = await Product.findById(req.params.id);
      if (!p) return res.status(404).json({ error: 'Not found' });
      await Product.deleteOne({ _id: p._id });
      // TODO: optionally remove images from cloudinary
      return res.json({ ok: true });
    }

    // soft-delete: set status=archived
    const p = await Product.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
    if (!p) return res.status(404).json({ error: 'Not found' });
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
      BlogPost.find(filter).sort({ updatedAt: -1 }).skip(Number(skip)).limit(Number(limit)),
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

// Get single post (admin)
router.get('/blog/:id', requireAdmin, async (req, res) => {
  try {
    const p = await BlogPost.findById(req.params.id);
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
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    
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

// Deactivate / archive admin (admin-only)
router.delete('/admins/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    if (req.admin._id.toString() === req.params.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
    const a = await Admin.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, admin: { _id: a._id, isActive: a.isActive } });
  } catch (err) {
    console.error('DELETE /admins/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- User management (admin-only) -------------------------------------------------
router.get('/users', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { q = '', limit = 200 } = req.query;
    const filter = {};
    if (q) filter.$or = [ { email: new RegExp(q, 'i') }, { name: new RegExp(q, 'i') } ];
    const items = await User.find(filter).select('-hashedPassword -resetToken -resetExpires').sort({ createdAt: -1 }).limit(Number(limit));
    res.json({ items });
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single user (admin)
router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const u = await User.findById(req.params.id).select('-hashedPassword -resetToken -resetExpires');
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
    const { name, isVerified } = req.body || {};
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    if (typeof name !== 'undefined') u.name = name;
    if (typeof isVerified !== 'undefined') u.isVerified = !!isVerified;
    await u.save();
    res.json({ ok: true, user: { _id: u._id, email: u.email, name: u.name, provider: u.provider, isVerified: u.isVerified, createdAt: u.createdAt } });
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

export default router;
