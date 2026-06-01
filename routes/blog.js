import express from 'express';
import BlogPost from '../models/BlogPost.js';
import BlogCategory from '../models/BlogCategory.js';

const router = express.Router();

// Public: list published posts
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, q, tag, featured } = req.query;
    const skip = (Math.max(1, page) - 1) * limit;
    const filter = { status: 'published' };
    if (q) filter.$or = [ { title: new RegExp(q, 'i') }, { excerpt: new RegExp(q, 'i') }, { content: new RegExp(q, 'i') } ];
    if (tag) filter.tags = tag;
    if (featured === 'true') filter.isFeatured = true;
    if (featured === 'false') filter.isFeatured = { $ne: true }; // Not featured or undefined

    const [items, total] = await Promise.all([
      BlogPost.find(filter).sort({ publishedAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean(),
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
    const post = await BlogPost.findOne({ slug, status: 'published' }).lean();
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json({ post });
  } catch (err) {
    console.error('GET /api/blog/:slug error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public: get related blogs by slug
router.get('/:slug/related', async (req, res) => {
  try {
    const slug = req.params.slug;
    const { limit = 3 } = req.query;
    
    // First get the current blog post
    const currentPost = await BlogPost.findOne({ slug, status: 'published' }).lean();
    if (!currentPost) return res.status(404).json({ error: 'Not found' });
    
    // Build query to find related posts
    const relatedQuery = {
      status: 'published',
      _id: { $ne: currentPost._id } // Exclude current post
    };
    
    // Find posts with matching categories or tags
    const orConditions = [];
    if (currentPost.categories && currentPost.categories.length > 0) {
      orConditions.push({ categories: { $in: currentPost.categories } });
    }
    if (currentPost.tags && currentPost.tags.length > 0) {
      orConditions.push({ tags: { $in: currentPost.tags } });
    }
    
    if (orConditions.length > 0) {
      relatedQuery.$or = orConditions;
    }
    
    // Fetch related posts, sorted by most recent
    const relatedPosts = await BlogPost.find(relatedQuery)
      .sort({ publishedAt: -1 })
      .limit(Number(limit))
      .select('title slug excerpt featuredImage featuredImageLegacy author publishedAt readingTime tags')
      .lean();
    
    // If we don't have enough related posts, fill with latest posts
    if (relatedPosts.length < Number(limit)) {
      const additionalPosts = await BlogPost.find({
        status: 'published',
        _id: { 
          $nin: [currentPost._id, ...relatedPosts.map(p => p._id)] 
        }
      })
        .sort({ publishedAt: -1 })
        .limit(Number(limit) - relatedPosts.length)
        .select('title slug excerpt featuredImage featuredImageLegacy author publishedAt readingTime tags')
        .lean();
      
      relatedPosts.push(...additionalPosts);
    }
    
    res.json({ relatedPosts });
  } catch (err) {
    console.error('GET /api/blog/:slug/related error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public: list all blog categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await BlogCategory.find().sort({ name: 1 });
    res.json({ categories });
  } catch (err) {
    console.error('GET /api/blog/categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
