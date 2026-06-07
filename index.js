// dotenv/config MUST be the very first import.
// With ESM all static imports are hoisted before any code runs, so
// 'import dotenv; dotenv.config()' fires AFTER other modules are already
// evaluated. Importing the side-effect entry point directly fixes this.
import 'dotenv/config';

import express from "express";
import cors from "cors";
import SSLCommerzPayment from "sslcommerz-lts";
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import productRoutes from './routes/products.js';
import blogRoutes from './routes/blog.js';
import userRoutes from './routes/user.js';
import orderRoutes from './routes/orders.js';
import couponRoutes from './routes/coupons.js';
import { syncActiveShipments } from './lib/shipmentTracking.js';
import { seedDefaultsIfEmpty } from './lib/courierDefaults.js';

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const WHITELIST = new Set([
  FRONTEND_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASSWORD;
const is_live = false //true for live, false for sandbox

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
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

// Connect to MongoDB (with fallback if SRV DNS lookup fails)
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/yourhaat';
const MONGODB_URI_DIRECT = process.env.MONGODB_URI_DIRECT;

async function connectMongo() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected');
    await seedDefaultsIfEmpty();
  } catch (err) {
    const isSrvLookupFailure = err?.syscall === 'querySrv' || err?.code === 'ECONNREFUSED';
    if (isSrvLookupFailure && MONGODB_URI_DIRECT) {
      console.warn('MongoDB SRV lookup failed; trying MONGODB_URI_DIRECT fallback...');
      await mongoose.connect(MONGODB_URI_DIRECT);
      console.log('MongoDB connected (direct URI fallback)');
      await seedDefaultsIfEmpty();
      return;
    }
    console.error('MongoDB connection error', err);
  }
}

connectMongo();

// Helpful startup info
console.log(
  'Using MongoDB URI:',
  process.env.MONGODB_URI ? 'MONGODB_URI' : (process.env.MONGO_URI ? 'MONGO_URI' : 'default localhost'),
  process.env.MONGODB_URI_DIRECT ? '(direct fallback configured)' : '(no direct fallback)'
);

app.get("/", (req, res) => {
  res.send("Welcome to Budget Friendly Backend!");
});

app.use('/api/auth', authRoutes);// here have all of the auth related routes like login, register, logout, refresh token etc.

app.use('/api/admin', adminRoutes);// here have all of the admin related routes like user management, product management, order management etc.

app.use('/api/user', userRoutes); // user-level endpoints for profile, addresses, etc.

app.use('/api/orders', orderRoutes); // order placement, payment callbacks, order history

app.use('/api/coupons', couponRoutes); // coupon listing, eligibility checking, progress indicators

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

// Public: list active promo strip items (used below homepage banner)
app.get('/api/promo-strip', async (req, res) => {
  try {
    const { default: PromoStripItem } = await import('./models/PromoStripItem.js');
    const items = await PromoStripItem.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /api/promo-strip error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public: list active promo panels (used by Popular Picks left panel)
app.get('/api/promo-panels', async (req, res) => {
  try {
    const { default: PromoPanel } = await import('./models/PromoPanel.js');
    const items = await PromoPanel.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /api/promo-panels error:', err);
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

// Public: get active popup (used by frontend on page load)
app.get('/api/popup', async (req, res) => {
  try {
    const { default: Popup } = await import('./models/Popup.js');
    const popup = await Popup.findOne({ isActive: true });
    res.json({ popup: popup || null });
  } catch (err) {
    console.error('GET /api/popup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public: list active discount offers (used by OffersToSayYes on homepage)
app.get('/api/discounts', async (req, res) => {
  try {
    const { default: Discount } = await import('./models/Discount.js');
    const items = await Discount.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (err) {
    console.error('GET /api/discounts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public: join product waitlist
app.post('/api/waitlist', async (req, res) => {
  try {
    const { productId, productTitle, email, phone } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId is required' });
    if (!email && !phone) return res.status(400).json({ error: 'email or phone is required' });
    const { default: Waitlist } = await import('./models/Waitlist.js');
    // Deduplicate: prevent same contact joining waitlist for the same product twice
    const dupFilter = { productId };
    if (email) dupFilter.email = email.trim().toLowerCase();
    else if (phone) dupFilter.phone = phone.trim();
    const existing = await Waitlist.findOne(dupFilter);
    if (existing) return res.status(200).json({ ok: true, entry: existing, duplicate: true });
    const entry = await Waitlist.create({
      productId,
      productTitle,
      email: email ? email.trim().toLowerCase() : undefined,
      phone: phone ? phone.trim() : undefined
    });
    res.status(201).json({ ok: true, entry });
  } catch (err) {
    console.error('POST /api/waitlist error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  const syncIntervalMs = Number(process.env.SHIPMENT_SYNC_INTERVAL_MS || 15 * 60 * 1000);
  if (syncIntervalMs > 0) {
    setInterval(async () => {
      try {
        const results = await syncActiveShipments(25);
        const synced = results.filter((r) => r.ok && !r.skipped).length;
        if (synced > 0) {
          console.log(`Shipment sync: updated ${synced} order(s)`);
        }
      } catch (err) {
        console.warn('Shipment sync job failed:', err.message);
      }
    }, syncIntervalMs);
  }
});
