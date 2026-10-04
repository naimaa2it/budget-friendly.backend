# Pickob E-Commerce Backend

A comprehensive Node.js/Express backend for the Pickob e-commerce platform with admin dashboard, payment integration, and full API support.

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
cd Pickobbackend
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
curl https://api.pickob.com/api/auth/ping
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
MONGODB_URI=mongodb://localhost:27017/Pickob

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key_here_min_32_chars

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_FOLDER=Pickob/products

# Image Optimization
IMG_MAX_WIDTH=1600
IMG_QUALITY=75

# CORS Configuration
FRONTEND_ORIGIN=http://localhost:3000
BACKEND_URL=https://api.pickob.com

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
```

---

## 🗂️ Project Structure

```
Pickobbackend/
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
Development: https://api.pickob.com
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
curl https://api.pickob.com/api/products?page=1&limit=20
```

**Create Order:**

```bash
curl -X POST https://api.pickob.com/api/orders \
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
curl -X POST https://api.pickob.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@Pickob.com",
    "password": "admin123"
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
curl -X POST https://api.pickob.com/api/products/upload \
  -F "image=@/path/to/image.jpg"
```

**Response:**

```json
{
  "url": "https://res.cloudinary.com/.../optimized.webp",
  "public_id": "Pickob/products/abc123"
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
- Failed login tracking (max 20 attempts)
- Account lockout (2 hours)

### API Security

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
curl https://api.pickob.com/api/auth/ping

# Test product listing
curl https://api.pickob.com/api/products?limit=5

# Test with authentication
curl https://api.pickob.com/api/auth/me \
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
heroku create Pickob-api

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
cd Pickobbackend
npm install

# Start with PM2
pm2 start index.js --name Pickob-api
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
        proxy_pass https://api.pickob.com;
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

- **Email:** support@Pickob.com
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

**Built with ❤️ by the Pickob Team**

**Version:** 1.0.0
**Last Updated:** March 28, 2026

---

## Quick Links

- 📖 [Full API Documentation](./API_DOCUMENTATION.md)
- 🔍 [Quick Reference Guide](./API_QUICK_REFERENCE.md)
- 🧪 [Testing Guide](./API_TESTING_GUIDE.md)
- 🌐 [Frontend Repository](#)
- 📊 [Admin Dashboard](#)