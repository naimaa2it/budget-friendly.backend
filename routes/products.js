import express from 'express';
import Product from '../models/Product.js';

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

export default router;
