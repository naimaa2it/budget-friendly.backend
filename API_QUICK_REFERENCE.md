# API Quick Reference Guide

**Base URL:** `https://your-backend-domain.com`

---

## Authentication Flow

```
1. User Login → POST /api/auth/firebase-login
   ↓ Returns JWT in httpOnly cookie
2. Access Protected Routes (cookie sent automatically)
3. Logout → POST /api/auth/logout
```

---

## Quick Endpoint Index

### 🔐 Authentication (`/api/auth`)

| Method | Endpoint          | Auth   | Description                        |
| ------ | ----------------- | ------ | ---------------------------------- |
| GET    | `/ping`           | -      | Health check                       |
| POST   | `/firebase-login` | -      | Login with Firebase (Google/Email) |
| POST   | `/logout`         | -      | Clear auth cookie                  |
| GET    | `/me`             | Cookie | Get current logged-in user         |

---

### 👤 User Management (`/api/user`)

| Method | Endpoint         | Auth | Description                |
| ------ | ---------------- | ---- | -------------------------- |
| PUT    | `/profile`       | User | Update profile (multipart) |
| GET    | `/addresses`     | User | List addresses             |
| POST   | `/addresses`     | User | Add address                |
| PUT    | `/addresses/:id` | User | Update address             |
| DELETE | `/addresses/:id` | User | Delete address             |
| POST   | `/subscribe`     | User | Subscribe to newsletter    |
| POST   | `/unsubscribe`   | User | Unsubscribe                |

---

### 🛍️ Products - Public (`/api/products`)

| Method | Endpoint      | Auth | Description                         |
| ------ | ------------- | ---- | ----------------------------------- |
| GET    | `/`           | -    | List products (filters, pagination) |
| GET    | `/categories` | -    | Get category tree                   |
| GET    | `/:id`        | -    | Get single product                  |
| POST   | `/upload`     | -    | Upload & optimize image             |

**Key Query Params for GET /:**

- `q` - Search, `categoryId` - Filter by category
- `sort` - position/newest/priceHigh/priceLow
- `minPrice`, `maxPrice` - Price range
- `badge`, `flag`, `status`, `brand`, `minRating`
- `page`, `limit` - Pagination

---

### 🛍️ Products - Reviews & Questions (`/api/products`)

| Method | Endpoint                                     | Auth | Description       |
| ------ | -------------------------------------------- | ---- | ----------------- |
| POST   | `/:id/reviews`                               | User | Submit review     |
| PUT    | `/:id/reviews/:index`                        | User | Edit own review   |
| POST   | `/:id/questions`                             | User | Ask question      |
| PUT    | `/:id/questions/:index`                      | User | Edit own question |
| POST   | `/:id/questions/:qIdx/answers`               | User | Answer question   |
| PUT    | `/:id/questions/:qIdx/answers/:aIdx`         | User | Edit own answer   |
| POST   | `/:id/questions/:qIdx/answers/:aIdx/helpful` | User | Vote helpful      |

---

### 🛍️ Products - Admin Management

| Method | Endpoint                                          | Auth  | Description          |
| ------ | ------------------------------------------------- | ----- | -------------------- |
| GET    | `/admin-reviews`                                  | Admin | Get all reviews      |
| GET    | `/admin-questions`                                | Admin | Get all questions    |
| PUT    | `/admin-reviews/:productId/:index`                | Admin | Edit any review      |
| DELETE | `/:id/reviews/:index`                             | Admin | Delete review        |
| PUT    | `/admin-questions/:productId/:index`              | Admin | Answer/edit question |
| DELETE | `/admin-questions/:productId/:index`              | Admin | Delete question      |
| DELETE | `/admin-questions/:productId/:qIdx/answers/:aIdx` | Admin | Delete answer        |

---

### 📝 Blog (`/api/blog`)

| Method | Endpoint         | Auth | Description               |
| ------ | ---------------- | ---- | ------------------------- |
| GET    | `/`              | -    | List published posts      |
| GET    | `/:slug`         | -    | Get single post by slug   |
| GET    | `/:slug/related` | -    | Get related posts by slug |

**Query Params:** `page`, `limit`, `q` (search), `tag`, `featured`  
**Related Posts Params:** `limit` (default: 3)

---

### 🛒 Orders - Customer (`/api/orders`)

| Method | Endpoint      | Auth | Description                          |
| ------ | ------------- | ---- | ------------------------------------ |
| POST   | `/quote`      | -    | Get price preview (no order created) |
| POST   | `/`           | -    | Create order (COD/Online)            |
| GET    | `/my`         | User | Get my orders                        |
| GET    | `/:id`        | -    | Get single order                     |
| POST   | `/:id/pay`    | User | Retry payment                        |
| PATCH  | `/:id/cancel` | User | Cancel order (30min window)          |
| PATCH  | `/:id/edit`   | User | Edit order details (30min)           |

**Payment Callbacks (SSLCommerz):**

- POST `/payment/success` - Payment success
- POST `/payment/fail` - Payment failed
- POST `/payment/cancel` - Payment cancelled
- POST `/payment/ipn` - Instant notification

---

### 🔧 Admin - Authentication (`/api/admin`)

| Method | Endpoint       | Auth | Description                   |
| ------ | -------------- | ---- | ----------------------------- |
| POST   | `/check-email` | -    | Check if admin email exists   |
| POST   | `/login`       | -    | Admin login (requires secret) |
| POST   | `/forgot`      | -    | Request password reset        |
| POST   | `/reset`       | -    | Reset password with token     |

---

### 🔧 Admin - General (`/api/admin`)

| Method | Endpoint      | Auth  | Description                |
| ------ | ------------- | ----- | -------------------------- |
| POST   | `/upload`     | Admin | Upload image to Cloudinary |
| GET    | `/top-banner` | -     | Get top banner (public)    |
| GET    | `/settings`   | Admin | Get all settings           |
| PUT    | `/settings`   | Admin | Update settings            |

---

### 🔧 Admin - Categories

| Method | Endpoint          | Auth  | Description         |
| ------ | ----------------- | ----- | ------------------- |
| GET    | `/categories`     | Admin | List all categories |
| GET    | `/categories/:id` | Admin | Get single category |
| POST   | `/categories`     | Admin | Create category     |
| PUT    | `/categories/:id` | Admin | Update category     |
| DELETE | `/categories/:id` | Admin | Delete category     |

**Note:** Max 10 categories per parent, max depth 2 levels

---

### 🔧 Admin - Products

| Method | Endpoint                    | Auth  | Description                 |
| ------ | --------------------------- | ----- | --------------------------- |
| GET    | `/products`                 | Admin | List products (all filters) |
| POST   | `/products`                 | Admin | Create product              |
| GET    | `/products/:id`             | Admin | Get single product          |
| PUT    | `/products/:id`             | Admin | Update product              |
| DELETE | `/products/:id?force=false` | Admin | Delete (soft/hard)          |

---

### 🔧 Admin - Blog

| Method | Endpoint    | Auth  | Description     |
| ------ | ----------- | ----- | --------------- |
| GET    | `/blog`     | Admin | List blog posts |
| POST   | `/blog`     | Admin | Create post     |
| GET    | `/blog/:id` | Admin | Get single post |
| PUT    | `/blog/:id` | Admin | Update post     |
| DELETE | `/blog/:id` | Admin | Archive post    |

---

### 🔧 Admin - Users

| Method | Endpoint     | Auth  | Description               |
| ------ | ------------ | ----- | ------------------------- |
| GET    | `/users`     | Admin | List users (max 200/page) |
| GET    | `/users/:id` | Admin | Get single user           |
| PUT    | `/users/:id` | Admin | Update user               |
| DELETE | `/users/:id` | Admin | Delete user               |

---

### 🔧 Admin - Admin Accounts

| Method | Endpoint      | Auth  | Description                |
| ------ | ------------- | ----- | -------------------------- |
| GET    | `/admins`     | Admin | List all admins/moderators |
| GET    | `/admins/:id` | Admin | Get single admin           |
| POST   | `/admins`     | Admin | Create admin/moderator     |
| PUT    | `/admins/:id` | Admin | Update admin               |
| DELETE | `/admins/:id` | Admin | Deactivate admin           |

---

### 🔧 Admin - Content Management

**Occasions** (`/api/admin/occasions`)

- GET, POST, GET /:id, PUT /:id, DELETE /:id
- PUT `/occasions-reorder` - Batch reorder

**Featured Sections** (`/api/admin/featured`)

- GET, POST, GET /:id, PUT /:id, DELETE /:id
- PUT `/featured-reorder`

**Promo Strip** (`/api/admin/promo-strip`)

- GET, POST, GET /:id, PUT /:id, DELETE /:id
- PUT `/promo-strip-reorder`

**Banners** (`/api/admin/banners`)

- GET, POST, GET /:id, PUT /:id, DELETE /:id
- PUT `/banners-reorder`

**Promo Panels** (`/api/admin/promo-panels`)

- GET, POST, GET /:id, PUT /:id, DELETE /:id
- PUT `/promo-panels-reorder`

**Popup** (`/api/admin/popup`) - _Singleton_

- GET, PUT, DELETE

---

### 🔧 Admin - Media Library

| Method | Endpoint         | Auth  | Description            |
| ------ | ---------------- | ----- | ---------------------- |
| GET    | `/media`         | Admin | List Cloudinary images |
| GET    | `/media/folders` | Admin | List folder structure  |
| DELETE | `/media`         | Admin | Batch delete images    |

**Query Params:** `folder`, `next_cursor`, `q`

---

### 🔧 Admin - Discounts

| Method | Endpoint             | Auth  | Description     |
| ------ | -------------------- | ----- | --------------- |
| GET    | `/discounts`         | Admin | List discounts  |
| POST   | `/discounts`         | Admin | Create discount |
| PUT    | `/discounts/:id`     | Admin | Update discount |
| DELETE | `/discounts/:id`     | Admin | Delete discount |
| PUT    | `/discounts-reorder` | Admin | Batch reorder   |

---

### 🔧 Admin - Waitlist

| Method | Endpoint                 | Auth  | Description      |
| ------ | ------------------------ | ----- | ---------------- |
| GET    | `/waitlist`              | Admin | List entries     |
| PUT    | `/waitlist/:id/notified` | Admin | Mark as notified |
| DELETE | `/waitlist/:id`          | Admin | Delete entry     |

**Query Params:** `productId`, `notified`

---

### 🔧 Admin - Orders & Dashboard

| Method | Endpoint                     | Auth  | Description               |
| ------ | ---------------------------- | ----- | ------------------------- |
| GET    | `/dashboard-overview`        | Admin | Dashboard stats & reports |
| GET    | `/orders`                    | Admin | List all orders           |
| GET    | `/orders/:id`                | Admin | Get single order          |
| PUT    | `/orders/:id/status`         | Admin | Update order status       |
| PUT    | `/orders/:id/payment-status` | Admin | Update payment status     |
| DELETE | `/orders/:id`                | Admin | Delete order              |

**Order Statuses:** created, pending, confirmed, processing, sent-to-courier, delivered, cancelled, failed

**Payment Statuses:** pending, paid, failed, refunded

---

### 🌐 Public Content APIs

| Method | Endpoint            | Auth | Description              |
| ------ | ------------------- | ---- | ------------------------ |
| GET    | `/api/occasions`    | -    | Active occasion sections |
| GET    | `/api/featured`     | -    | Active featured sections |
| GET    | `/api/promo-strip`  | -    | Active promo strip items |
| GET    | `/api/promo-panels` | -    | Active promo panels      |
| GET    | `/api/banners`      | -    | Active banners           |
| GET    | `/api/popup`        | -    | Active popup             |
| GET    | `/api/discounts`    | -    | Active discounts         |
| POST   | `/api/waitlist`     | -    | Join product waitlist    |

---

## Common Request Body Examples

### Create Order

```json
{
  "userEmail": "customer@example.com",
  "items": [
    {
      "productId": "prod123",
      "quantity": 2,
      "color": "Red",
      "size": "M"
    }
  ],
  "billingDetails": {
    "name": "John Doe",
    "phone": "+8801712345678",
    "email": "customer@example.com",
    "city": "Dhaka",
    "zone": "Mirpur",
    "address": "123 Main Street",
    "note": "Optional delivery notes"
  },
  "paymentMethod": "cash-on-delivery",
  "couponCode": "SAVE150"
}
```

### Submit Review

```json
{
  "authorName": "John Doe",
  "rating": 5,
  "title": "Great product!",
  "body": "Really satisfied with this purchase."
}
```

### Create Product (Minimal)

```json
{
  "title": "Product Name",
  "slug": "product-name",
  "description": "Short description",
  "price": 1500,
  "images": ["https://..."],
  "categoryId": "cat123",
  "inventory": 50,
  "status": "published"
}
```

### Admin Login

```json
{
  "email": "admin@example.com",
  "password": "your_password",
  "secret": "admin_secret_key"
}
```

---

## Response Format Standards

### Success Response

```json
{
  "ok": true,
  "items": [...],  // or "product", "order", "user", etc.
  "total": 100,
  "page": 1,
  "limit": 20
}
```

### Error Response

```json
{
  "error": "Error message"
}
```

---

## Status Codes

| Code | Meaning                                  |
| ---- | ---------------------------------------- |
| 200  | Success (GET, PUT, PATCH)                |
| 201  | Created (POST)                           |
| 400  | Bad Request / Validation Error           |
| 401  | Unauthorized / Not Authenticated         |
| 403  | Forbidden / Insufficient Permissions     |
| 404  | Not Found                                |
| 423  | Account Locked (too many login attempts) |
| 500  | Internal Server Error                    |
| 502  | Payment Gateway Error                    |

---

## Built-in Coupons

| Code        | Discount | Min Purchase | Notes          |
| ----------- | -------- | ------------ | -------------- |
| NEWUSER26   | 50৳      | None         | New users only |
| SAVE150     | 150৳     | None         | All users      |
| CASHBACK100 | 100৳     | None         | All users      |

### Auto Discounts

- ≥ 2000৳ → 150৳ off
- ≥ 3000৳ → 250৳ off

---

## Shipping Costs

```javascript
if (subtotal >= 999) {
  shipping = 0; // FREE
} else if (city === "Dhaka") {
  shipping = 70;
} else {
  shipping = 130;
}
```

---

## Image Upload Specs

- **Max Size:** 10MB
- **Formats:** JPEG, PNG, WebP, AVIF
- **Output:** WebP (quality 75)
- **Max Width:** 1600px
- **Auto-rotation:** Based on EXIF

---

## Authentication Headers

### Cookie-Based (Automatic)

```
Cookie: token=<jwt_token>
```

### JWT Payload

```json
// User
{
  "id": "user123",
  "role": "user"
}

// Admin
{
  "id": "admin123",
  "role": "admin",
  "type": "admin"
}
```

---

## Pagination Defaults

| Endpoint | Default Limit | Max Limit |
| -------- | ------------- | --------- |
| Products | 20            | 100       |
| Blog     | 10            | 50        |
| Orders   | 20            | 100       |
| Users    | 50            | 200       |
| Media    | 60            | 100       |

---

## Environment Variables Checklist

### Required

- ✅ `MONGODB_URI`
- ✅ `JWT_SECRET`
- ✅ `ADMIN_SECRET`
- ✅ `CLOUDINARY_CLOUD_NAME`
- ✅ `CLOUDINARY_API_KEY`
- ✅ `CLOUDINARY_API_SECRET`
- ✅ `STORE_ID` (SSLCommerz)
- ✅ `STORE_PASSWORD` (SSLCommerz)

### Optional

- `FRONTEND_ORIGIN` (default: http://localhost:3000)
- `BACKEND_URL`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- `IMG_MAX_WIDTH` (default: 1600)
- `IMG_QUALITY` (default: 75)
- `CLOUDINARY_FOLDER` (default: SmartBuy BD/products)

---

## Testing Credentials

### Admin Login

```
Email: admin@SmartBuy BD.com
Password: admin123
Secret: [Your ADMIN_SECRET]
```

### SSLCommerz Sandbox (Test Card)

```
Card: 4532015112830366
Expiry: 12/30
CVV: 123
```

---

## Common Tasks Quick Commands

### cURL Examples

**Get Products:**

```bash
curl https://api.SmartBuy BD.com/api/products?page=1&limit=20
```

**Create Order:**

```bash
curl -X POST https://api.SmartBuy BD.com/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "test@example.com",
    "items": [{"productId": "prod123", "quantity": 1}],
    "billingDetails": {...},
    "paymentMethod": "cash-on-delivery"
  }'
```

**Admin Login:**

```bash
curl -X POST https://api.SmartBuy BD.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@SmartBuy BD.com",
    "password": "admin123",
    "secret": "your_secret"
  }' \
  -c cookies.txt
```

**Get Dashboard (with cookie):**

```bash
curl https://api.SmartBuy BD.com/api/admin/dashboard-overview \
  -b cookies.txt
```

---

## Role-Based Access

### User Role

- ✅ View products, blog, orders
- ✅ Create orders, reviews, questions
- ✅ Manage own profile & addresses
- ❌ Admin panel access

### Moderator Role

- ✅ All user permissions
- ✅ View admin dashboard
- ✅ Edit products, categories, reviews, questions
- ✅ Answer questions officially
- ✅ Edit content sections (banners, featured, etc.)
- ❌ Delete products, categories, orders
- ❌ View/manage orders
- ❌ Access /authorized routes
- ❌ Manage admins

### Admin Role

- ✅ Full access to all endpoints
- ✅ Create/delete any resource
- ✅ Manage users, orders, admins
- ✅ Access all dashboard sections

---

## Rate Limiting Recommendations

**Not currently implemented.** Suggested limits:

- Login endpoints: 5 requests / 15 min
- API endpoints: 100 requests / 15 min
- File uploads: 10 requests / hour
- Order creation: 10 requests / hour

---

## Support

- **Full Documentation:** See `API_DOCUMENTATION.md`
- **Email:** support@SmartBuy BD.com
- **Version:** 1.0.0
- **Last Updated:** March 28, 2026
