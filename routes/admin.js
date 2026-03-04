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
import categoryRoutes from './category.js';

const router = express.Router();
const SALT_ROUNDS = 12; // Increased from 10 for better security

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

// Image upload to Cloudinary (admin-only) — optimized server-side with sharp
router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    ensureCloudinaryConfigured(); // configure on first use
    
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // fail fast if Cloudinary is not configured correctly
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary configuration missing');
      return res.status(500).json({ error: 'Server upload not configured (Cloudinary credentials missing).' });
    }

    const maxWidth = Number(process.env.IMG_MAX_WIDTH) || 1600;
    const quality = Number(process.env.IMG_QUALITY) || 75;

    // optimize image with sharp (resize, rotate, convert to webp)
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
    }});
  } catch (err) {
    console.error('Upload error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Category routes moved to `routes/category.js`
router.use('/categories', categoryRoutes);

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

router.post('/products', requireAdmin, async (req, res) => {
  try {
    let payload = req.body || {};

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

    // Load existing product to detect removed images
    const existing = await Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

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

      await Product.deleteOne({ _id: p._id });
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

export default router;
