import express from 'express';
import BlogPost from '../models/BlogPost.js';

const router = express.Router();

// Public: list published posts
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, q, tag } = req.query;
    const skip = (Math.max(1, page) - 1) * limit;
    const filter = { status: 'published' };
    if (q) filter.$or = [ { title: new RegExp(q, 'i') }, { excerpt: new RegExp(q, 'i') }, { content: new RegExp(q, 'i') } ];
    if (tag) filter.tags = tag;

    const [items, total] = await Promise.all([
      BlogPost.find(filter).sort({ publishedAt: -1 }).skip(Number(skip)).limit(Number(limit)),
      BlogPost.countDocuments(filter)
    ]);
    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('GET /api/blog error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public: get by slug
router.get('/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const post = await BlogPost.findOne({ slug, status: 'published' });
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json({ post });
  } catch (err) {
    console.error('GET /api/blog/:slug error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
