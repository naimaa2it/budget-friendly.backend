# API Testing Guide

This guide provides ready-to-use examples for testing all API endpoints using **Postman**, **cURL**, or **JavaScript fetch**.

---

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [Authentication Flow](#authentication-flow)
3. [Product APIs](#product-apis)
4. [Order & Payment Flow](#order--payment-flow)
5. [Admin APIs](#admin-apis)
6. [Testing Checklist](#testing-checklist)

---

## Setup & Configuration

### Base URL

```
Development: https://api.pickob.com
Production: https://api.yourdomain.com
```

### Headers for All Requests

```
Content-Type: application/json
```

### Cookie-Based Authentication

After login, the server sets an `httpOnly` cookie named `token`.

**In Postman:**

- Postman automatically handles cookies
- Or manually add: `Cookie: token=<jwt_token>`

**In cURL:**

- Save cookies: `-c cookies.txt`
- Use cookies: `-b cookies.txt`

---

## Authentication Flow

### 1. User Login (Firebase)

**Postman:**

```
POST {{baseUrl}}/api/auth/firebase-login
Content-Type: application/json

Body (JSON):
{
  "email": "user@example.com",
  "name": "John Doe",
  "image": "https://example.com/avatar.jpg",
  "provider": "google.com"
}
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/auth/firebase-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "image": "https://example.com/avatar.jpg",
    "provider": "google.com"
  }' \
  -c cookies.txt
```

**JavaScript (fetch):**

```javascript
fetch("https://api.pickob.com/api/auth/firebase-login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  credentials: "include", // Important for cookies
  body: JSON.stringify({
    email: "user@example.com",
    name: "John Doe",
    image: "https://example.com/avatar.jpg",
    provider: "google.com",
  }),
})
  .then((res) => res.json())
  .then((data) => console.log(data));
```

**Expected Response:**

```json
{
  "user": {
    "_id": "user123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "provider": "google.com",
    "newsletterSubscribed": true
  }
}
```

---

### 2. Check Current User

**Postman:**

```
GET {{baseUrl}}/api/auth/me
```

**cURL:**

```bash
curl https://api.pickob.com/api/auth/me \
  -b cookies.txt
```

**Expected Response:**

```json
{
  "user": {
    "_id": "user123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  }
}
```

---

### 3. Admin Login

**Postman:**

```
POST {{baseUrl}}/api/admin/login
Content-Type: application/json

Body:
{
  "email": "admin@Pickob.com",
  "password": "admin123"
}
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@Pickob.com",
    "password": "admin123"
  }' \
  -c admin_cookies.txt
```

**Expected Response:**

```json
{
  "ok": true,
  "admin": {
    "_id": "admin123",
    "email": "admin@Pickob.com",
    "name": "Admin Name",
    "role": "admin"
  }
}
```

---

### 4. Logout

**Postman:**

```
POST {{baseUrl}}/api/auth/logout
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/auth/logout \
  -b cookies.txt \
  -c cookies.txt
```

---

## Product APIs

### 1. List Products (with Filters)

**Postman:**

```
GET {{baseUrl}}/api/products?page=1&limit=20&sort=priceLow&minPrice=500&maxPrice=2000&categoryId=cat123
```

**cURL:**

```bash
curl "https://api.pickob.com/api/products?page=1&limit=20&sort=priceLow&minPrice=500&maxPrice=2000"
```

**JavaScript:**

```javascript
const params = new URLSearchParams({
  page: 1,
  limit: 20,
  sort: "priceLow",
  minPrice: 500,
  maxPrice: 2000,
  categoryId: "cat123",
});

fetch(`https://api.pickob.com/api/products?${params}`)
  .then((res) => res.json())
  .then((data) => console.log(data));
```

**Expected Response:**

```json
{
  "ok": true,
  "products": [
    {
      "_id": "prod123",
      "title": "Product Name",
      "price": 1500,
      "images": ["https://..."],
      "averageRating": 4.5,
      "reviewCount": 42
    }
  ],
  "total": 150,
  "page": 1,
  "totalPages": 8
}
```

---

### 2. Search Products

**Postman:**

```
GET {{baseUrl}}/api/products?q=phone&page=1&limit=20
```

**cURL:**

```bash
curl "https://api.pickob.com/api/products?q=phone&page=1&limit=20"
```

---

### 3. Get Single Product

**Postman:**

```
GET {{baseUrl}}/api/products/prod123
```

**cURL:**

```bash
curl https://api.pickob.com/api/products/prod123
```

---

### 4. Get Category Tree

**Postman:**

```
GET {{baseUrl}}/api/products/categories
```

**cURL:**

```bash
curl https://api.pickob.com/api/products/categories
```

---

### 5. Submit Product Review (User Auth Required)

**Postman:**

```
POST {{baseUrl}}/api/products/prod123/reviews
Content-Type: application/json

Body:
{
  "authorName": "John Doe",
  "rating": 5,
  "title": "Great product!",
  "body": "I'm very satisfied with this purchase. Highly recommended!"
}
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/products/prod123/reviews \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "authorName": "John Doe",
    "rating": 5,
    "title": "Great product!",
    "body": "I am very satisfied with this purchase."
  }'
```

**JavaScript:**

```javascript
fetch("https://api.pickob.com/api/products/prod123/reviews", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    authorName: "John Doe",
    rating: 5,
    title: "Great product!",
    body: "I am very satisfied with this purchase.",
  }),
})
  .then((res) => res.json())
  .then((data) => console.log(data));
```

---

### 6. Ask Product Question

**Postman:**

```
POST {{baseUrl}}/api/products/prod123/questions
Content-Type: application/json

Body:
{
  "question": "Does this come with a warranty?",
  "askerName": "Jane Smith"
}
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/products/prod123/questions \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "question": "Does this come with a warranty?",
    "askerName": "Jane Smith"
  }'
```

---

### 7. Upload Product Image

**Postman:**

```
POST {{baseUrl}}/api/products/upload
Content-Type: multipart/form-data

Body (form-data):
- Key: image
- Type: File
- Value: [Select image file]
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/products/upload \
  -F "image=@/path/to/image.jpg"
```

**JavaScript (with FormData):**

```javascript
const formData = new FormData();
formData.append("image", fileInput.files[0]);

fetch("https://api.pickob.com/api/products/upload", {
  method: "POST",
  body: formData,
})
  .then((res) => res.json())
  .then((data) => console.log(data));
```

**Expected Response:**

```json
{
  "url": "https://res.cloudinary.com/.../optimized.webp",
  "public_id": "Pickob/products/abc123"
}
```

---

## Order & Payment Flow

### 1. Get Price Quote (Preview)

**Postman:**

```
POST {{baseUrl}}/api/orders/quote
Content-Type: application/json

Body:
{
  "items": [
    {
      "productId": "prod123",
      "quantity": 2,
      "color": "Red",
      "size": "M"
    }
  ],
  "city": "Dhaka",
  "couponCode": "SAVE150"
}
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/orders/quote \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "productId": "prod123",
        "quantity": 2,
        "color": "Red",
        "size": "M"
      }
    ],
    "city": "Dhaka",
    "couponCode": "SAVE150"
  }'
```

**Expected Response:**

```json
{
  "subtotal": 3000,
  "shipping": 0,
  "discount": 150,
  "total": 2850,
  "appliedCoupon": {
    "code": "SAVE150",
    "discount": 150
  },
  "breakdown": [
    {
      "productId": "prod123",
      "title": "Product Name",
      "price": 1500,
      "quantity": 2,
      "subtotal": 3000
    }
  ]
}
```

---

### 2. Create Order (COD)

**Postman:**

```
POST {{baseUrl}}/api/orders
Content-Type: application/json

Body:
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
    "address": "123 Main Street, Apt 4B",
    "note": "Please call before delivery"
  },
  "paymentMethod": "cash-on-delivery",
  "couponCode": "SAVE150"
}
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/orders \
  -H "Content-Type: application/json" \
  -d '{
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
      "address": "123 Main Street"
    },
    "paymentMethod": "cash-on-delivery",
    "couponCode": "SAVE150"
  }'
```

**Expected Response (COD):**

```json
{
  "ok": true,
  "order": {
    "_id": "order123",
    "orderId": "YH-20260328-001",
    "status": "created",
    "paymentStatus": "pending",
    "total": 2850,
    "confirmAfter": "2026-03-28T13:00:00.000Z"
  }
}
```

---

### 3. Create Order (Online Payment)

**Same as above, but:**

```json
{
  "paymentMethod": "online"
}
```

**Expected Response:**

```json
{
  "ok": true,
  "order": {
    "_id": "order123",
    "status": "created",
    "paymentStatus": "unpaid"
  },
  "paymentUrl": "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=..."
}
```

**Next Step:** Redirect user to `paymentUrl`

---

### 4. Get My Orders (User Auth)

**Postman:**

```
GET {{baseUrl}}/api/orders/my?page=1&limit=10
```

**cURL:**

```bash
curl https://api.pickob.com/api/orders/my?page=1&limit=10 \
  -b cookies.txt
```

---

### 5. Get Single Order

**Postman:**

```
GET {{baseUrl}}/api/orders/order123
```

**cURL:**

```bash
curl https://api.pickob.com/api/orders/order123
```

---

### 6. Order Cancel(within 30 min)

**Postman:**

```
PATCH {{baseUrl}}/api/orders/order123/cancel
```

**cURL:**

```bash
curl -X PATCH https://api.pickob.com/api/orders/order123/cancel \
  -b cookies.txt
```

---

## Admin APIs

### 1. Get Dashboard Overview

**Postman:**

```
GET {{baseUrl}}/api/admin/dashboard-overview
```

**cURL:**

```bash
curl https://api.pickob.com/api/admin/dashboard-overview \
  -b admin_cookies.txt
```

**Expected Response:**

```json
{
  "overview": {
    "totalOrders": 5000,
    "totalSales": 2500000,
    "totalProfit": 750000,
    "pendingOrders": 15
  },
  "reports": {
    "today": { "orders": 25, "sales": 125000, "profit": 37500 },
    "yesterday": { ... },
    "last7Days": { ... },
    "last30Days": { ... }
  },
  "orderFlow": {
    "created": 50,
    "pending": 15,
    "confirmed": 30,
    "delivered": 4500
  },
  "recentOrders": [...],
  "topSellingProducts": [...],
  "stock": {
    "outOfStockCount": 25,
    "lowStockCount": 50
  }
}
```

---

### 2. Create Category

**Postman:**

```
POST {{baseUrl}}/api/admin/categories
Content-Type: application/json

Body:
{
  "name": "Electronics",
  "slug": "electronics",
  "image": "https://res.cloudinary.com/.../category.webp",
  "parentId": null,
  "isActive": true
}
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/admin/categories \
  -H "Content-Type: application/json" \
  -b admin_cookies.txt \
  -d '{
    "name": "Electronics",
    "slug": "electronics",
    "image": "https://res.cloudinary.com/.../category.webp",
    "isActive": true
  }'
```

---

### 3. Create Product

**Postman:**

```
POST {{baseUrl}}/api/admin/products
Content-Type: application/json

Body:
{
  "title": "Wireless Headphones",
  "slug": "wireless-headphones",
  "description": "High-quality wireless headphones with noise cancellation",
  "detailedDescription": "<p>Full HTML description here</p>",
  "sku": "WH-001",
  "price": 2500,
  "compareAtPrice": 3500,
  "images": [
    "https://res.cloudinary.com/.../image1.webp",
    "https://res.cloudinary.com/.../image2.webp"
  ],
  "categoryId": "cat123",
  "department": "Electronics",
  "tags": ["wireless", "audio", "bluetooth"],
  "badges": ["best-seller"],
  "colors": ["Black", "White", "Blue"],
  "sizes": [],
  "inventory": 100,
  "availability": "in-stock",
  "status": "published",
  "featured": true,
  "specs": [
    { "label": "Battery Life", "value": "20 hours" },
    { "label": "Connectivity", "value": "Bluetooth 5.0" }
  ],
  "warranty": {
    "period": "1 year",
    "details": "Manufacturer warranty",
    "provider": "Brand Name"
  },
  "returnPolicy": {
    "days": 7,
    "refundable": true,
    "details": "Unused with original packaging"
  },
  "seo": {
    "title": "Buy Wireless Headphones - Pickob",
    "description": "Shop high-quality wireless headphones",
    "keywords": ["wireless", "headphones", "bluetooth"]
  }
}
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/admin/products \
  -H "Content-Type: application/json" \
  -b admin_cookies.txt \
  -d @product.json
```

---

### 4. Update Product

**Postman:**

```
PUT {{baseUrl}}/api/admin/products/prod123
Content-Type: application/json

Body (partial update):
{
  "price": 2300,
  "inventory": 80,
  "featured": false
}
```

---

### 5. Delete Product (Soft Delete)

**Postman:**

```
DELETE {{baseUrl}}/api/admin/products/prod123
```

**cURL:**

```bash
curl -X DELETE https://api.pickob.com/api/admin/products/prod123 \
  -b admin_cookies.txt
```

---

### 6. Delete Product (Force/Permanent)

**Postman:**

```
DELETE {{baseUrl}}/api/admin/products/prod123?force=true
```

**cURL:**

```bash
curl -X DELETE "https://api.pickob.com/api/admin/products/prod123?force=true" \
  -b admin_cookies.txt
```

---

### 7. List All Orders

**Postman:**

```
GET {{baseUrl}}/api/admin/orders?page=1&limit=50&status=pending&paymentStatus=paid
```

**cURL:**

```bash
curl "https://api.pickob.com/api/admin/orders?page=1&limit=50&status=pending" \
  -b admin_cookies.txt
```

---

### 8. Update Order Status

**Postman:**

```
PUT {{baseUrl}}/api/admin/orders/order123/status
Content-Type: application/json

Body:
{
  "status": "confirmed"
}
```

**Allowed Statuses:**

- `created`
- `pending`
- `confirmed`
- `processing`
- `sent-to-courier`
- `delivered`
- `cancelled`
- `failed`

**cURL:**

```bash
curl -X PUT https://api.pickob.com/api/admin/orders/order123/status \
  -H "Content-Type: application/json" \
  -b admin_cookies.txt \
  -d '{"status": "confirmed"}'
```

---

### 9. Create Banner

**Postman:**

```
POST {{baseUrl}}/api/admin/banners
Content-Type: application/json

Body:
{
  "title": "Summer Sale",
  "desktopImage": "https://res.cloudinary.com/.../desktop.webp",
  "mobileImage": "https://res.cloudinary.com/.../mobile.webp",
  "desktopPublicId": "Pickob/banners/desktop123",
  "mobilePublicId": "Pickob/banners/mobile123",
  "link": "/shop/summer-sale",
  "isActive": true
}
```

---

### 10. Create Blog Post

**Postman:**

```
POST {{baseUrl}}/api/admin/blog
Content-Type: application/json

Body:
{
  "title": "Top 10 Fashion Trends in 2026",
  "slug": "top-10-fashion-trends-2026",
  "content": "<p>Full HTML content of the blog post...</p>",
  "excerpt": "Discover the latest fashion trends this year.",
  "coverImage": "https://res.cloudinary.com/.../cover.webp",
  "author": {
    "name": "Admin Name",
    "avatar": "https://...",
    "bio": "Fashion expert"
  },
  "tags": ["fashion", "trends", "2026"],
  "status": "published",
  "publishedAt": "2026-03-28T10:00:00.000Z",
  "seo": {
    "title": "Top 10 Fashion Trends in 2026 | Pickob Blog",
    "description": "Explore the hottest fashion trends of 2026",
    "keywords": ["fashion", "trends", "style"]
  }
}
```

---

### 11. Upload Image (Admin)

**Postman:**

```
POST {{baseUrl}}/api/admin/upload
Content-Type: multipart/form-data

Body (form-data):
- Key: image, Type: File, Value: [Select file]
- Key: folder, Type: Text, Value: banners
```

**cURL:**

```bash
curl -X POST https://api.pickob.com/api/admin/upload \
  -b admin_cookies.txt \
  -F "image=@/path/to/banner.jpg" \
  -F "folder=banners"
```

---

### 12. List Media (Cloudinary)

**Postman:**

```
GET {{baseUrl}}/api/admin/media?folder=Pickob/products&next_cursor=abc123
```

**cURL:**

```bash
curl "https://api.pickob.com/api/admin/media?folder=Pickob/products" \
  -b admin_cookies.txt
```

---

### 13. Delete Media (Batch)

**Postman:**

```
DELETE {{baseUrl}}/api/admin/media
Content-Type: application/json

Body:
{
  "public_ids": [
    "Pickob/products/old_image1",
    "Pickob/banners/old_banner"
  ]
}
```

**cURL:**

```bash
curl -X DELETE https://api.pickob.com/api/admin/media \
  -H "Content-Type: application/json" \
  -b admin_cookies.txt \
  -d '{
    "public_ids": [
      "Pickob/products/old_image1",
      "Pickob/banners/old_banner"
    ]
  }'
```

---

### 14. Create Admin/Moderator

**Postman:**

```
POST {{baseUrl}}/api/admin/admins
Content-Type: application/json

Body:
{
  "email": "moderator@Pickob.com",
  "name": "Moderator Name",
  "password": "securePassword123",
  "role": "moderator"
}
```

**Roles:**

- `admin` - Full access
- `moderator` - Limited access (can't delete, can't see orders)

---

### 15. Update Settings

**Postman:**

```
PUT {{baseUrl}}/api/admin/settings
Content-Type: application/json

Body:
{
  "topBannerText": "Free shipping on orders over 999৳",
  "topBannerLink": "/shop",
  "topBannerEnabled": true,
  "stockThreshold": 10,
  "lowStockAlert": true
}
```

---

## Testing Checklist

### Basic Flow Testing

#### ✅ User Flow

1. [ ] User login via Firebase
2. [ ] Browse products with filters
3. [ ] View single product
4. [ ] Submit product review
5. [ ] Ask product question
6. [ ] Create COD order
7. [ ] View my orders
8. [ ] order Cancel(within 30 min)
9. [ ] Update profile
10. [ ] Add/edit/delete address

#### ✅ Admin Flow

1. [ ] Admin login with secret
2. [ ] View dashboard overview
3. [ ] Create category
4. [ ] Create product
5. [ ] Upload images
6. [ ] Create banner
7. [ ] Create blog post
8. [ ] View all orders
9. [ ] Update order status
10. [ ] Manage users
11. [ ] Create moderator account

#### ✅ Payment Flow

1. [ ] Create online payment order
2. [ ] Redirect to payment gateway
3. [ ] Test payment success callback
4. [ ] Verify order status updated
5. [ ] Test payment failure callback
6. [ ] Retry failed payment

#### ✅ Error Handling

1. [ ] Test 401 (not authenticated)
2. [ ] Test 403 (insufficient permissions)
3. [ ] Test 404 (resource not found)
4. [ ] Test 400 (validation errors)
5. [ ] Test inventory errors
6. [ ] Test account locked (max login attempts)

---

## Common Testing Scenarios

### Scenario 1: Complete Order Flow

```
1. GET /api/products (Browse products)
2. GET /api/products/:id (View product details)
3. POST /api/orders/quote (Get price preview)
4. POST /api/orders (Create order)
5. GET /api/orders/:id (View order confirmation)
```

### Scenario 2: Admin Product Management

```
1. POST /api/admin/login (Login as admin)
2. POST /api/admin/upload (Upload product image)
3. POST /api/admin/categories (Create category)
4. POST /api/admin/products (Create product)
5. GET /api/products/:id (Verify product is visible)
6. PUT /api/admin/products/:id (Update product)
```

### Scenario 3: User Engagement

```
1. POST /api/auth/firebase-login (User login)
2. GET /api/products/:id (View product)
3. POST /api/products/:id/reviews (Submit review)
4. POST /api/products/:id/questions (Ask question)
5. POST /api/products/:id/questions/:qIdx/answers (Answer from another user)
```

---

## Postman Collection Structure

```
📁 Pickob API
├── 📁 Auth
│   ├── User Login (Firebase)
│   ├── Admin Login
│   ├── Get Current User
│   └── Logout
├── 📁 Products
│   ├── List Products
│   ├── Search Products
│   ├── Get Single Product
│   ├── Get Categories
│   ├── Upload Image
│   ├── Submit Review
│   ├── Ask Question
│   └── Answer Question
├── 📁 Orders
│   ├── Get Quote
│   ├── Create Order (COD)
│   ├── Create Order (Online)
│   ├── Get My Orders
│   ├── Get Single Order
│   ├──  Order Cancel
│   └── Payment Callbacks
├── 📁 Admin - Dashboard
│   ├── Get Overview
│   ├── Get Orders
│   ├── Update Order Status
│   └── Update Payment Status
├── 📁 Admin - Products
│   ├── List Products
│   ├── Create Product
│   ├── Update Product
│   ├── Delete Product
│   └── Manage Reviews/Questions
├── 📁 Admin - Categories
│   ├── List Categories
│   ├── Create Category
│   ├── Update Category
│   └── Delete Category
├── 📁 Admin - Content
│   ├── Banners (CRUD)
│   ├── Featured Sections (CRUD)
│   ├── Promo Panels (CRUD)
│   ├── Occasions (CRUD)
│   ├── Popup (CRUD)
│   └── Blog (CRUD)
├── 📁 Admin - Media
│   ├── List Media
│   ├── Upload Image
│   └── Delete Media
└── 📁 Admin - Users
    ├── List Users
    ├── Manage Admins
    └── Settings
```

---

## Environment Variables for Postman

Create environment in Postman with these variables:

```
baseUrl: https://api.pickob.com
adminEmail: admin@Pickob.com
adminPassword: admin123
testUserId: user123
testProductId: prod123
testOrderId: order123
```

---

## Browser Testing (JavaScript Console)

Open browser console and test APIs directly:

```javascript
// Test product listing
fetch("https://api.pickob.com/api/products?page=1&limit=10")
  .then((r) => r.json())
  .then((data) => console.log(data));

// Test user login
fetch("https://api.pickob.com/api/auth/firebase-login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    email: "test@example.com",
    name: "Test User",
    provider: "password",
  }),
})
  .then((r) => r.json())
  .then((data) => console.log(data));

// Test getting current user
fetch("https://api.pickob.com/api/auth/me", {
  credentials: "include",
})
  .then((r) => r.json())
  .then((data) => console.log(data));
```

---

## Automated Testing Script (Node.js)

Create a test file `test-api.js`:

```javascript
const axios = require("axios");

const baseURL = "https://api.pickob.com";
const api = axios.create({
  baseURL,
  withCredentials: true,
  validateStatus: () => true,
});

async function runTests() {
  console.log("🧪 Starting API Tests...\n");

  // Test 1: Health Check
  const ping = await api.get("/api/auth/ping");
  console.log("✅ Ping:", ping.data.message);

  // Test 2: List Products
  const products = await api.get("/api/products?limit=5");
  console.log(`✅ Products: Found ${products.data.total} products`);

  // Test 3: User Login
  const login = await api.post("/api/auth/firebase-login", {
    email: "test@example.com",
    name: "Test User",
    provider: "password",
  });
  console.log("✅ User Login:", login.data.user?.email);

  // Test 4: Get Current User
  const me = await api.get("/api/auth/me");
  console.log("✅ Current User:", me.data.user?.email);

  // Test 5: Create Order Quote
  const quote = await api.post("/api/orders/quote", {
    items: [{ productId: "prod123", quantity: 1 }],
    city: "Dhaka",
  });
  console.log("✅ Order Quote:", quote.data.total + "৳");

  console.log("\n🎉 All tests completed!");
}

runTests().catch(console.error);
```

Run: `node test-api.js`

---

**Happy Testing! 🚀**

For detailed API documentation, see `API_DOCUMENTATION.md`.
For quick reference, see `API_QUICK_REFERENCE.md`.
