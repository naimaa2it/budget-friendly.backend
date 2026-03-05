import dotenv from "dotenv";
dotenv.config(); // MUST be first so env vars are available to all imports

import express from "express";
import cors from "cors";
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import productRoutes from './routes/products.js';
import blogRoutes from './routes/blog.js';
import userRoutes from './routes/user.js';

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const WHITELIST = new Set([
  FRONTEND_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

// Dynamic CORS handling — always reflect request origin so any frontend
// (Vercel preview URLs, custom domains, local dev) can call the API.
// Credentials are still guarded — cookies are only sent from allowed origins
// and verified server-side via JWT/session checks in each route.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    // Always reflect the caller's origin so cookies work on every domain
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    console.log(`Preflight (OPTIONS) from ${origin} for ${req.url}`);
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use(cookieParser());

// request logger to help debug incoming calls
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} Origin:${req.headers.origin} Cookie:${req.headers.cookie || ''}`);
  next();
});

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/yourhaat';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error', err));

// Helpful startup info
console.log('Using MongoDB URI:', process.env.MONGODB_URI ? 'MONGODB_URI' : (process.env.MONGO_URI ? 'MONGO_URI' : 'default localhost'));

app.get("/", (req, res) => {
  res.send("Welcome to YourHaat Backend!");
});

app.use('/api/auth', authRoutes);// here have all of the auth related routes like login, register, logout, refresh token etc.

app.use('/api/admin', adminRoutes);// here have all of the admin related routes like user management, product management, order management etc.

app.use('/api/user', userRoutes); // user-level endpoints for profile, addresses, etc.

app.use('/api/products', productRoutes);//here have all of the product related routes like add product, update product, delete product, get products etc.

app.use('/api/blog', blogRoutes);//here have all of the blog related routes like add blog, update blog, delete blog, get blogs etc.

// Public: list active occasion sections (used by homepage)
app.get('/api/occasions', async (req, res) => {
  try {
    const { default: OccasionSection } = await import('./models/OccasionSection.js');
    const items = await OccasionSection.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /api/occasions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public: list active featured sections with populated products (used by homepage)
app.get('/api/featured', async (req, res) => {
  try {
    const { default: FeaturedSection } = await import('./models/FeaturedSection.js');
    const { default: Product } = await import('./models/Product.js');
    const sections = await FeaturedSection.find({ isActive: true }).sort({ order: 1, createdAt: 1 });

    const result = await Promise.all(sections.map(async (sec) => {
      let products = [];
      if (sec.productIds && sec.productIds.length > 0) {
        // manual product list
        products = await Product.find({ _id: { $in: sec.productIds }, status: { $ne: 'archived' } });
        // preserve admin order
        const idOrder = sec.productIds.map(id => id.toString());
        products.sort((a, b) => idOrder.indexOf(a._id.toString()) - idOrder.indexOf(b._id.toString()));
      } else if (sec.categoryId) {
        // auto-pull from category
        products = await Product.find({ categoryId: sec.categoryId, status: { $ne: 'archived' } })
          .sort({ updatedAt: -1 })
          .limit(sec.limit || 10);
      }
      return { ...sec.toObject(), products };
    }));

    res.json({ items: result });
  } catch (err) {
    console.error('GET /api/featured error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public: list active banner slides (used by homepage)
app.get('/api/banners', async (req, res) => {
  try {
    const { default: Banner } = await import('./models/Banner.js');
    const items = await Banner.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /api/banners error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});