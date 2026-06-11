import express from 'express';
import jwt from 'jsonwebtoken';
import Product from '../models/Product.js';
import SearchLog from '../models/SearchLog.js';
import Admin from '../models/Admin.js';

const router = express.Router();

const requireAdmin = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const admin = await Admin.findById(payload.id);
    if (!admin) return res.status(403).json({ error: 'Admin not found' });
    if (!admin.isActive) return res.status(403).json({ error: 'Account disabled' });
    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Public — log a search term (fire-and-forget from frontend)
router.post('/search', async (req, res) => {
  try {
    const raw = String(req.body?.term || '').trim().toLowerCase();
    if (!raw || raw.length < 2 || raw.length > 200) return res.json({ ok: true });

    await SearchLog.findOneAndUpdate(
      { term: raw },
      { $inc: { count: 1 }, $set: { lastSearchedAt: new Date() } },
      { upsert: true },
    );
    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); // never fail the caller
  }
});

// Public — increment product view count (fire-and-forget from frontend)
router.post('/view/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId || productId.length !== 24) return res.json({ ok: true });
    await Product.findByIdAndUpdate(productId, { $inc: { viewCount: 1 } });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// Admin — top searched terms
router.get('/most-searched', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const items = await SearchLog.find()
      .sort({ count: -1, lastSearchedAt: -1 })
      .limit(limit)
      .lean();
    res.json({ items });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin — most viewed products
router.get('/most-popular', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const items = await Product.find({ status: { $ne: 'archived' } })
      .sort({ viewCount: -1 })
      .limit(limit)
      .select('title slug images price variants viewCount monthlySold status')
      .lean();
    res.json({ items });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin — reset a product's view count
router.delete('/most-popular/:id', requireAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { viewCount: 0 } },
      { new: true },
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin — delete a search term entry
router.delete('/most-searched/:id', requireAdmin, async (req, res) => {
  try {
    const doc = await SearchLog.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
