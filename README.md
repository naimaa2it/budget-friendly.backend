# SmartBuy BD E-Commerce Backend

A comprehensive Node.js/Express backend for the SmartBuy BD e-commerce platform with admin dashboard, payment integration, and full API support.

---

## 🚀 Features

### Core Features

- ✅ **User Authentication** - Firebase OAuth (Google, Email/Password) with JWT
- ✅ **Product Management** - Full CRUD with variants, reviews, Q&A
- ✅ **Category Management** - Multi-level category tree (max 3 levels)
- ✅ **Order Processing** - COD + Online payment (SSLCommerz)
- ✅ **Payment Gateway** - SSLCommerz integration (Bkash, cards, wallets)
- ✅ **Admin Dashboard** - Complete admin panel with analytics
- ✅ **Role-Based Access** - Admin, Moderator, User roles
- ✅ **Media Management** - Cloudinary integration with auto-optimization
- ✅ **Blog System** - Full-featured blog with SEO
- ✅ **Email Notifications** - Order confirmations, password resets
- ✅ **Discount System** - Coupons, auto-discounts, promo codes
- ✅ **Waitlist** - Out-of-stock product notifications

### Advanced Features

- 🎨 **Image Optimization** - Auto WebP conversion, resizing with Sharp
- 📊 **Analytics Dashboard** - Sales reports, revenue tracking, top products
- 🔒 **Security** - httpOnly cookies, bcrypt passwords, account lockout
- 📦 **Inventory Management** - Real-time stock tracking, low-stock alerts
- ⭐ **Product Reviews** - User reviews with ratings and helpful votes
- ❓ **Product Q&A** - Community questions with official answers
- 🎁 **Frequently Bought Together** - Smart product recommendations
- 🔄 **Order Management** - Edit/cancel within 30 minutes
- 📧 **Newsletter** - Email subscription management
- 🏷️ **Dynamic Pricing** - Auto-discounts based on cart value

---

## 📚 Documentation

| Document                                               | Description                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)**     | Complete API reference with all endpoints, request/response formats |
| **[API_QUICK_REFERENCE.md](./API_QUICK_REFERENCE.md)** | Quick lookup guide for all API endpoints                            |
| **[API_TESTING_GUIDE.md](./API_TESTING_GUIDE.md)**     | Testing guide with Postman/cURL/JS examples                         |

---

## 🛠️ Tech Stack

- **Runtime:** Node.js (v16+)
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose ODM)
- **Authentication:** JWT (httpOnly cookies)
- **Image Storage:** Cloudinary
- **Image Processing:** Sharp
- **Payment Gateway:** SSLCommerz
- **Email:** Nodemailer
- **Validation:** Custom middleware
- **Security:** bcrypt, helmet (recommended)

---

## 📦 Installation

### Prerequisites

- Node.js v16 or higher
- MongoDB (local or Atlas)
- Cloudinary account
- SSLCommerz account (for payments)

### Setup

1. **Clone the repository**

```bash
git clone <your-repo-url>
cd SmartBuy BDbackend
```

2. **Install dependencies**

```bash
npm install
```

3. **Create `.env` file**

```bash
cp .env.example .env
```

4. **Configure environment variables** (see [Environment Variables](#environment-variables))

5. **Start the server**

```bash
# Development
npm run dev

# Production
npm start
```

6. **Verify installation**

```bash
curl http://localhost:5000/api/auth/ping
```

Expected response:

```json
{
  "message": "pong",
  "timestamp": "2026-03-28T10:00:00.000Z"
}
```

---

## 🔐 Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/SmartBuy BD

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key_here_min_32_chars

# Admin Secret (for admin creation)
ADMIN_SECRET=your_admin_secret_key

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_FOLDER=SmartBuy BD/products

# Image Optimization
IMG_MAX_WIDTH=1600
IMG_QUALITY=75

# CORS Configuration
FRONTEND_ORIGIN=http://localhost:3000
BACKEND_URL=http://localhost:5000

# SSLCommerz Payment Gateway
STORE_ID=your_store_id
STORE_PASSWORD=your_store_password
IS_LIVE=false

# Email Configuration (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_specific_password

# Optional — Pathao Merchant API (automatic courier status sync)
# PATHAO_CLIENT_ID=
# PATHAO_CLIENT_SECRET=
# PATHAO_USERNAME=
# PATHAO_PASSWORD=
# PATHAO_WEBHOOK_SECRET=
# SHIPMENT_SYNC_INTERVAL_MS=900000
```

### Shipment tracking without a courier merchant account

You can run the shop **without** Pathao/Steadfast merchant API credentials:

1. **Admin → Orders** — set courier + consignment ID (or paste the public tracking URL from the courier SMS). Save shipment details.
2. **Order status** — use the status dropdown (Processing → Shipped → Delivered). This updates the customer timeline on your site.
3. **Customer** — sees **Track on Pathao** (or Steadfast/RedX) when a tracking link is saved; they check live status on the courier’s website.

**Not available without merchant API:** automatic sync from courier, background status polling, Pathao webhooks.

When you later get a **Pathao Merchant** account, add `PATHAO_CLIENT_ID`, `PATHAO_CLIENT_SECRET`, `PATHAO_USERNAME`, and `PATHAO_PASSWORD` to `.env`. Restart the server — **Sync from Courier** and periodic sync will start working.

> Scraping public tracking pages is not supported (fragile, may violate courier terms). Steadfast/RedX merchant APIs can be added later similar to Pathao.

### Generate Secrets

```bash
# Generate JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Admin Secret
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## 🗂️ Project Structure

```
SmartBuy BDbackend/
├── index.js                 # Main server file
├── routes/
│   ├── auth.js             # Authentication routes
│   ├── user.js             # User profile & addresses
│   ├── products.js         # Product CRUD, reviews, Q&A
│   ├── blog.js             # Blog posts
│   ├── orders.js           # Order processing & payments
│   ├── category.js         # Category management
│   └── admin.js            # Admin panel APIs (1697 lines)
├── models/
│   ├── User.js             # User schema
│   ├── Product.js          # Product schema
│   ├── Order.js            # Order schema
│   ├── Category.js         # Category schema
│   ├── BlogPost.js         # Blog post schema
│   ├── Settings.js         # Site settings
│   ├── Banner.js           # Homepage banners
│   ├── OccasionSection.js  # Occasion sections
│   ├── FeaturedSection.js  # Featured products
│   ├── PromoPanel.js       # Promo panels
│   ├── PromoStrip.js       # Promo strip items
│   ├── Popup.js            # Popup modal
│   ├── Discount.js         # Discount codes
│   └── Waitlist.js         # Product waitlist
├── lib/
│   ├── requireAdmin.js     # Admin auth middleware
│   └── requireUser.js      # User auth middleware
├── .env                    # Environment variables (create this)
├── package.json            # Dependencies
├── API_DOCUMENTATION.md    # Full API docs
├── API_QUICK_REFERENCE.md  # Quick reference
├── API_TESTING_GUIDE.md    # Testing guide
└── README.md              # This file
```

---

## 🔑 API Overview

### Base URL

```
Development: http://localhost:5000
Production: https://api.yourdomain.com
```

### Main Endpoints

| Category     | Base Path       | Description                              |
| ------------ | --------------- | ---------------------------------------- |
| **Auth**     | `/api/auth`     | User/admin authentication                |
| **User**     | `/api/user`     | User profile & addresses                 |
| **Products** | `/api/products` | Product catalog, reviews, Q&A            |
| **Blog**     | `/api/blog`     | Blog posts                               |
| **Orders**   | `/api/orders`   | Order processing & payments              |
| **Admin**    | `/api/admin`    | Admin dashboard & management             |
| **Public**   | `/api/*`        | Public content (banners, featured, etc.) |

### Quick Examples

**List Products:**

```bash
curl http://localhost:5000/api/products?page=1&limit=20
```

**Create Order:**

```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "customer@example.com",
    "items": [{"productId": "prod123", "quantity": 1}],
    "billingDetails": {...},
    "paymentMethod": "cash-on-delivery"
  }'
```

**Admin Login:**

```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@SmartBuy BD.com",
    "password": "admin123",
    "secret": "your_admin_secret"
  }'
```

📖 **For complete API documentation, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)**

---

## 👥 User Roles

### User (Customer)

- Browse and search products
- Submit reviews and ask questions
- Create and manage orders
- Manage profile and addresses
- Subscribe/unsubscribe from newsletter

### Moderator

- All user permissions
- Edit products, categories, content
- Answer questions officially
- Manage reviews and Q&A
- ❌ Cannot delete products/categories
- ❌ Cannot view/manage orders
- ❌ Cannot access /authorized routes

### Admin

- Full access to all features
- Create/delete any resource
- Manage users, orders, and admins
- Access all dashboard sections
- Configure site settings

---

## 💳 Payment Integration

### SSLCommerz Setup

1. **Sign up** at [SSLCommerz](https://www.sslcommerz.com/)
2. **Get credentials** (Store ID & Password)
3. **Configure webhooks:**
   - Success: `https://yourapi.com/api/orders/payment/success`
   - Fail: `https://yourapi.com/api/orders/payment/fail`
   - Cancel: `https://yourapi.com/api/orders/payment/cancel`
   - IPN: `https://yourapi.com/api/orders/payment/ipn`

### Payment Flow

1. User creates order → `POST /api/orders`
2. If payment method = "online":
   - Server initiates SSLCommerz session
   - Returns `paymentUrl`
3. Frontend redirects to `paymentUrl`
4. User completes payment
5. SSLCommerz redirects to success/fail callback
6. Server validates payment and updates order

### Test Credentials (Sandbox)

```
Card Number: 4532015112830366
Expiry: 12/30
CVV: 123
```

---

## 🖼️ Image Optimization

All uploaded images are automatically optimized:

- **Format:** Converted to WebP
- **Quality:** 75% (configurable)
- **Max Width:** 1600px (configurable)
- **Auto-rotation:** Based on EXIF data
- **Storage:** Cloudinary CDN

### Upload Endpoint

```bash
curl -X POST http://localhost:5000/api/products/upload \
  -F "image=@/path/to/image.jpg"
```

**Response:**

```json
{
  "url": "https://res.cloudinary.com/.../optimized.webp",
  "public_id": "SmartBuy BD/products/abc123"
}
```

---

## 📊 Dashboard Analytics

The admin dashboard (`GET /api/admin/dashboard-overview`) provides:

- **Overview:** Total orders, sales, profit, pending orders
- **Reports:** Today, yesterday, last 7 days, last 30 days
- **Order Flow:** Breakdown by status
- **Recent Orders:** Latest 10 orders
- **Top Selling Products:** Revenue-based ranking
- **Hourly Revenue:** 24-hour revenue chart
- **Stock Alerts:** Low stock & out-of-stock products
- **Action Center:** Pending tasks requiring attention

---

## 🔒 Security Features

### Authentication

- JWT tokens stored in httpOnly cookies
- 7-day token expiration
- Secure: true, sameSite: 'none' for production

### Password Security

- Bcrypt hashing (12 rounds)
- Password reset tokens (1-hour expiry)
- Failed login tracking (max 5 attempts)
- Account lockout (2 hours)

### API Security

- Admin secret required for admin creation
- Role-based access control
- Input validation on all endpoints
- SQL injection prevention (Mongoose)

### Recommended Additions

- Rate limiting (express-rate-limit)
- Helmet.js for security headers
- CORS restricted to specific domains
- Request size limits

---

## 📧 Email Notifications

Emails are sent for:

- Order confirmation (customer & admin)
- Payment confirmation
- Password reset
- Admin forgot password

**Configure SMTP in `.env`:**

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

**For Gmail:**

1. Enable 2FA
2. Generate App Password
3. Use app password in SMTP_PASS

---

## 🧪 Testing

### Run Tests

See [API_TESTING_GUIDE.md](./API_TESTING_GUIDE.md) for detailed testing instructions.

**Quick Test:**

```bash
# Test server health
curl http://localhost:5000/api/auth/ping

# Test product listing
curl http://localhost:5000/api/products?limit=5

# Test with authentication
curl http://localhost:5000/api/auth/me \
  -H "Cookie: token=<your_jwt_token>"
```

### Postman Collection

Import the API collection structure from [API_TESTING_GUIDE.md](./API_TESTING_GUIDE.md).

---

## 🚀 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT_SECRET (32+ characters)
- [ ] Configure CORS for specific domain only
- [ ] Set `IS_LIVE=true` for SSLCommerz
- [ ] Use MongoDB Atlas (or managed DB)
- [ ] Configure email service (SendGrid/AWS SES)
- [ ] Set up Cloudinary production account
- [ ] Enable rate limiting
- [ ] Add Helmet.js security headers
- [ ] Set up monitoring (PM2, New Relic, etc.)
- [ ] Configure SSL/HTTPS
- [ ] Set up backup strategy
- [ ] Configure logging (Winston, Morgan)

### Deploy to Heroku

```bash
# Login to Heroku
heroku login

# Create app
heroku create SmartBuy BD-api

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI=<your_mongodb_atlas_uri>
heroku config:set JWT_SECRET=<your_secret>
# ... set all other env vars

# Deploy
git push heroku main

# Open app
heroku open
```

### Deploy to VPS (Ubuntu)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone and setup
git clone <your-repo>
cd SmartBuy BDbackend
npm install

# Start with PM2
pm2 start index.js --name SmartBuy BD-api
pm2 startup
pm2 save

# Configure Nginx reverse proxy
# ... (see Nginx config below)
```

**Nginx Config:**

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🐛 Troubleshooting

### MongoDB Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

**Solution:** Ensure MongoDB is running

```bash
# Start MongoDB (local)
mongod

# Or check connection string for MongoDB Atlas
```

### Cloudinary Upload Fails

```
Error: Must supply api_key
```

**Solution:** Verify Cloudinary credentials in `.env`

### Payment Gateway Error

```
Error: 502 Bad Gateway
```

**Solution:**

- Check SSLCommerz credentials
- Verify IS_LIVE setting matches account type (sandbox/live)
- Ensure callback URLs are publicly accessible

### JWT Cookie Not Set

```
401 Unauthorized
```

**Solution:**

- Check CORS configuration
- Ensure `credentials: 'include'` in frontend fetch
- Verify cookie settings (secure, sameSite)

### Image Upload Too Large

```
Error: File too large
```

**Solution:** Images must be < 10MB. Resize before uploading.

---

## 📈 Performance Optimization

### Database Indexing

```javascript
// Already implemented in models
Product: ["slug", "categoryId", "status", "featured"];
Order: ["userId", "userEmail", "status", "paymentStatus"];
User: ["email"];
```

### Caching Recommendations

- Redis for session storage
- Cache product listings (5 min TTL)
- Cache category tree (1 hour TTL)
- Cache dashboard stats (5 min TTL)

### Image Optimization

- Already implemented: WebP conversion, resizing
- Consider: Lazy loading, responsive images, CDN

---

## 📄 License

This project is proprietary and confidential.

---

## 📞 Support

- **Email:** support@SmartBuy BD.com
- **Documentation:** See `/docs` folder
- **Issues:** Create GitHub issue

---

## 🎯 Roadmap

### Upcoming Features

- [ ] Rate limiting implementation
- [ ] Redis caching layer
- [ ] WebSocket for real-time notifications
- [ ] Advanced analytics (Google Analytics integration)
- [ ] Multi-language support (i18n)
- [ ] Push notifications
- [ ] Social media integration
- [ ] Advanced search (Elasticsearch)
- [ ] Product import/export (CSV)
- [ ] Bulk operations for admin

---

## 🙏 Acknowledgments

- Express.js team
- MongoDB/Mongoose maintainers
- Cloudinary
- SSLCommerz
- Sharp image processing library
- All open-source contributors

---

**Built with ❤️ by the SmartBuy BD Team**

**Version:** 1.0.0
**Last Updated:** March 28, 2026

---

## Quick Links

- 📖 [Full API Documentation](./API_DOCUMENTATION.md)
- 🔍 [Quick Reference Guide](./API_QUICK_REFERENCE.md)
- 🧪 [Testing Guide](./API_TESTING_GUIDE.md)
- 🌐 [Frontend Repository](#)
- 📊 [Admin Dashboard](#)

// Connect to MongoDB (with fallback if SRV DNS lookup fails)
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/SmartBuy BD';
const MONGODB_URI_DIRECT = process.env.MONGODB_URI_DIRECT;

async function connectMongo() {

try {
await mongoose.connect(MONGODB_URI);
console.log('MongoDB connected');

} catch (err) {
const isSrvLookupFailure = err?.syscall === 'querySrv' || err?.code === 'ECONNREFUSED';
if (isSrvLookupFailure && MONGODB_URI_DIRECT) {
console.warn('MongoDB SRV lookup failed; trying MONGODB_URI_DIRECT fallback...');
await mongoose.connect(MONGODB_URI_DIRECT);
console.log('MongoDB connected (direct URI fallback)');
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

app.listen(PORT, () => {
console.log(`Server is running on port ${PORT}`);
});

ADMIN_EMAIL=naimaa2it@gmail.com
ADMIN_SECRET=SmartBuy BDadminsecrect262626
CLOUDINARY_API_KEY=446279722954425
CLOUDINARY_API_SECRET=6f286BxKJk2FEgR1kHYKoqlyTyY
CLOUDINARY_CLOUD_NAME=dqyaobg8j

# FRONTEND_ORIGIN=https://SmartBuy BDfrontend-ei5y.vercel.app

FRONTEND_ORIGIN=http://localhost:3000
MONGODB_URI="mongodb://SmartBuy BD:SmartBuy BD@ac-uarjbv7-shard-00-00.txpmesm.mongodb.net:27017,ac-uarjbv7-shard-00-01.txpmesm.mongodb.net:27017,ac-uarjbv7-shard-00-02.txpmesm.mongodb.net:27017/SmartBuy BD?ssl=true&replicaSet=atlas-ji89w4-shard-0&authSource=admin&retryWrites=true&w=majority"
PORT=5000
SMTP_HOST=smtp.gmail.com
SMTP_PASS="obsi iufk hodz hses"
SMTP_PORT=465
SMTP_USER=naimaa2it@gmail.com
STORE_EMAIL=naimaa2it@gmail.com
STORE_ID=a2it69acfd899c29d
STORE_NAME=budgetfriendly
STORE_PASSWORD=a2it69acfd899c29d@ssl
STORE_PHONE=01884242851

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
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/SmartBuy BD';
const MONGODB_URI_DIRECT = process.env.MONGODB_URI_DIRECT;

async function connectMongo() {
try {
await mongoose.connect(MONGODB_URI);
console.log('MongoDB connected');
} catch (err) {
const isSrvLookupFailure = err?.syscall === 'querySrv' || err?.code === 'ECONNREFUSED';
if (isSrvLookupFailure && MONGODB_URI_DIRECT) {
console.warn('MongoDB SRV lookup failed; trying MONGODB_URI_DIRECT fallback...');
await mongoose.connect(MONGODB_URI_DIRECT);
console.log('MongoDB connected (direct URI fallback)');
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
});
