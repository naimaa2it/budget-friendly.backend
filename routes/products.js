import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

// Public product listing with pagination, search, category filter
router.get('/', async (req, res) => {
  try {
    const { q, category, page = 1, limit = 20, status = 'published' } = req.query;
    const skip = (Math.max(1, page) - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
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

export default router;
