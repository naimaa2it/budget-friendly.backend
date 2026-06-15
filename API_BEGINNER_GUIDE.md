# Complete Step-by-Step API Guide (A to Z)

**SmartBuy BD E-Commerce API - Beginner's Guide**

This guide will walk you through every step of using the API, from the very first login to performing all major operations.

---

## 📋 Table of Contents

1. [Before You Start](#before-you-start)
2. [Step 1: Server Setup](#step-1-server-setup)
3. [Step 2: Your First API Call](#step-2-your-first-api-call)
4. [Step 3: User Login Flow](#step-3-user-login-flow)
5. [Step 4: Browse Products](#step-4-browse-products)
6. [Step 5: Create an Order](#step-5-create-an-order)
7. [Step 6: Admin Login](#step-6-admin-login)
8. [Step 7: Admin Dashboard](#step-7-admin-dashboard)
9. [Step 8: Manage Products](#step-8-manage-products)
10. [Step 9: Manage Orders](#step-9-manage-orders)
11. [Complete Use Cases](#complete-use-cases)

---

## Before You Start

### What You Need

1. **A tool to make API calls** (choose ONE):
   - **Postman** (Recommended for beginners) - Download: https://www.postman.com/downloads/
   - **cURL** (Command line tool, comes with Mac/Linux, Windows Git Bash)
   - **Your browser console** (Press F12 in Chrome/Firefox)

2. **Your backend server running**:
   - URL: `http://localhost:5000` (local development)
   - OR your production URL: `https://SmartBuy BDbackend.onrender.com`

3. **Basic information**:
   - Admin email and password (you'll create this)
   - Admin secret (from your .env file)

---

## Step 1: Server Setup

### 1.1 Start Your Server

```bash
# Navigate to backend folder
cd e:/SmartBuy BD/SmartBuy BDbackend

# Install dependencies (first time only)
npm install

# Start the server
npm start
```

**Expected Output:**

```
MongoDB connected
Server is running on port 5000
Using MongoDB URI: MONGODB_URI
```

✅ **Success!** Your server is now running at `http://localhost:5000`

---

### 1.2 Test If Server Is Working

**Using cURL:**

```bash
curl http://localhost:5000/api/auth/ping
```

**Using Browser:**
Open your browser and go to: `http://localhost:5000/api/auth/ping`

**Using Postman:**

1. Open Postman
2. Create a new request
3. Set method to `GET`
4. Enter URL: `http://localhost:5000/api/auth/ping`
5. Click "Send"

**Expected Response:**

```json
{
  "message": "pong",
  "timestamp": "2026-03-28T10:30:00.000Z"
}
```

✅ **Success!** If you see this response, your API is working!

---

## Step 2: Your First API Call

Let's understand how API calls work with a simple example.

### 2.1 Understanding API Requests

Every API call has these parts:

1. **Method** (GET, POST, PUT, DELETE)
   - GET = Read/Fetch data
   - POST = Create new data
   - PUT = Update existing data
   - DELETE = Remove data

2. **URL** (Where to send the request)
   - Example: `http://localhost:5000/api/products`

3. **Headers** (Additional information)
   - Example: `Content-Type: application/json`

4. **Body** (Data you're sending - only for POST/PUT)
   - Example: `{ "name": "John" }`

### 2.2 Make Your First Request: Get Products

**Using Postman:**

```
1. Click "New" → "HTTP Request"
2. Set Method: GET
3. Enter URL: http://localhost:5000/api/products
4. Click "Send"
```

**Using cURL:**

```bash
curl http://localhost:5000/api/products
```

**Using Browser Console (F12):**

```javascript
fetch("http://localhost:5000/api/products")
  .then((response) => response.json())
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
      "inventory": 50
    }
  ],
  "total": 100,
  "page": 1,
  "totalPages": 5
}
```

✅ **Congratulations!** You just made your first successful API call!

---

## Step 3: User Login Flow

Now let's learn how users log in and get authenticated.

### 3.1 Understanding Authentication

This API uses **JWT tokens** stored in **cookies**:

- When you log in successfully, the server sends back a cookie
- This cookie is automatically included in all future requests
- You don't need to manually handle the token (it's automatic!)

### 3.2 User Registration/Login (Firebase)

**Method:** POST
**URL:** `http://localhost:5000/api/auth/firebase-login`
**Content-Type:** application/json

**Request Body:**

```json
{
  "email": "john.doe@example.com",
  "name": "John Doe",
  "image": "https://example.com/avatar.jpg",
  "provider": "google.com"
}
```

**Using Postman:**

```
1. Method: POST
2. URL: http://localhost:5000/api/auth/firebase-login
3. Go to "Body" tab → Select "raw" → Select "JSON"
4. Paste the JSON above
5. Click "Send"
```

**Using cURL:**

```bash
curl -X POST http://localhost:5000/api/auth/firebase-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "name": "John Doe",
    "image": "https://example.com/avatar.jpg",
    "provider": "google.com"
  }' \
  -c cookies.txt
```

**Note:** The `-c cookies.txt` saves the cookie so you can use it later!

**Using Browser Console:**

```javascript
fetch("http://localhost:5000/api/auth/firebase-login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  credentials: "include", // IMPORTANT: This allows cookies!
  body: JSON.stringify({
    email: "john.doe@example.com",
    name: "John Doe",
    image: "https://example.com/avatar.jpg",
    provider: "google.com",
  }),
})
  .then((res) => res.json())
  .then((data) => {
    console.log("Login Success:", data);
  });
```

**Expected Response:**

```json
{
  "user": {
    "_id": "675d1234567890abcdef1234",
    "email": "john.doe@example.com",
    "name": "John Doe",
    "role": "user",
    "provider": "google.com",
    "newsletterSubscribed": true,
    "createdAt": "2026-03-28T10:00:00.000Z"
  }
}
```

✅ **You're now logged in!** The server has set a cookie in your browser/Postman.

---

### 3.3 Verify You're Logged In

**Method:** GET
**URL:** `http://localhost:5000/api/auth/me`

**Using Postman:**

```
1. Method: GET
2. URL: http://localhost:5000/api/auth/me
3. Click "Send"
```

**Note:** Postman automatically includes the cookie from the previous login request!

**Using cURL (with saved cookie):**

```bash
curl http://localhost:5000/api/auth/me -b cookies.txt
```

**Using Browser Console:**

```javascript
fetch("http://localhost:5000/api/auth/me", {
  credentials: "include",
})
  .then((res) => res.json())
  .then((data) => console.log("Current User:", data));
```

**Expected Response:**

```json
{
  "user": {
    "_id": "675d1234567890abcdef1234",
    "email": "john.doe@example.com",
    "name": "John Doe",
    "role": "user"
  }
}
```

✅ **Perfect!** You can see your logged-in user information.

---

## Step 4: Browse Products

Now that you're logged in, let's explore products.

### 4.1 Get All Products (Basic)

**Method:** GET
**URL:** `http://localhost:5000/api/products`

```bash
curl http://localhost:5000/api/products
```

---

### 4.2 Search Products

**Method:** GET
**URL:** `http://localhost:5000/api/products?q=phone`

```bash
curl "http://localhost:5000/api/products?q=phone"
```

**What this does:** Searches for products with "phone" in the title or description.

---

### 4.3 Filter by Price Range

**Method:** GET
**URL:** `http://localhost:5000/api/products?minPrice=500&maxPrice=2000`

```bash
curl "http://localhost:5000/api/products?minPrice=500&maxPrice=2000"
```

**What this does:** Shows only products between 500৳ and 2000৳.

---

### 4.4 Filter by Category

**Method:** GET
**URL:** `http://localhost:5000/api/products?categoryId=cat123`

```bash
curl "http://localhost:5000/api/products?categoryId=cat123"
```

---

### 4.5 Sort Products by Price (Low to High)

**Method:** GET
**URL:** `http://localhost:5000/api/products?sort=priceLow`

**All sort options:**

- `priceLow` - Cheapest first
- `priceHigh` - Most expensive first
- `newest` - Latest products first
- `oldest` - Oldest products first
- `nameAsc` - A to Z
- `nameDesc` - Z to A

---

### 4.6 Combine Filters (Power Search!)

**Method:** GET
**URL:** `http://localhost:5000/api/products?q=shirt&minPrice=500&maxPrice=1500&sort=priceLow&page=1&limit=20`

**Using Postman:**

```
1. Method: GET
2. URL: http://localhost:5000/api/products
3. Click "Params" tab
4. Add parameters:
   - q: shirt
   - minPrice: 500
   - maxPrice: 1500
   - sort: priceLow
   - page: 1
   - limit: 20
5. Click "Send"
```

**What this does:**

- Search for "shirt"
- Price between 500৳-1500৳
- Sort by lowest price
- Show page 1 with 20 items

---

### 4.7 Get Single Product Details

**Method:** GET
**URL:** `http://localhost:5000/api/products/prod123`

Replace `prod123` with the actual product ID from the list.

**Using cURL:**

```bash
curl http://localhost:5000/api/products/prod123
```

**Expected Response:**

```json
{
  "product": {
    "_id": "prod123",
    "title": "Wireless Headphones",
    "slug": "wireless-headphones",
    "price": 2500,
    "compareAtPrice": 3500,
    "images": ["https://..."],
    "description": "High quality headphones",
    "inventory": 50,
    "colors": ["Black", "White"],
    "reviews": [...],
    "averageRating": 4.5,
    "reviewCount": 42
  }
}
```

---

## Step 5: Create an Order

Now let's place an order! This is a multi-step process.

### 5.1 First, Get Price Quote (Optional but Recommended)

Before creating an actual order, let's preview the price.

**Method:** POST
**URL:** `http://localhost:5000/api/orders/quote`
**Content-Type:** application/json

**Request Body:**

```json
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

**Using Postman:**

```
1. Method: POST
2. URL: http://localhost:5000/api/orders/quote
3. Body → raw → JSON
4. Paste JSON above
5. Click "Send"
```

**Using cURL:**

```bash
curl -X POST http://localhost:5000/api/orders/quote \
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
  "subtotal": 5000,
  "shipping": 0,
  "discount": 150,
  "total": 4850,
  "appliedCoupon": {
    "code": "SAVE150",
    "discount": 150
  },
  "breakdown": [
    {
      "productId": "prod123",
      "title": "Wireless Headphones",
      "price": 2500,
      "quantity": 2,
      "subtotal": 5000
    }
  ],
  "shippingDetails": {
    "method": "Home Delivery",
    "cost": 0,
    "freeShippingThreshold": 999
  }
}
```

**Understanding the response:**

- Subtotal: 2500৳ × 2 = 5000৳
- Shipping: FREE (because subtotal ≥ 999৳)
- Discount: 150৳ (from coupon code SAVE150)
- Final Total: 5000 - 150 = 4850৳

---

### 5.2 Create the Actual Order

Now let's create the real order!

**Method:** POST
**URL:** `http://localhost:5000/api/orders`
**Content-Type:** application/json

**Request Body:**

```json
{
  "userEmail": "john.doe@example.com",
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
    "email": "john.doe@example.com",
    "city": "Dhaka",
    "zone": "Mirpur",
    "address": "123 Main Street, Apartment 4B",
    "note": "Please call before delivery"
  },
  "paymentMethod": "cash-on-delivery",
  "couponCode": "SAVE150"
}
```

**Using Postman:**

```
1. Method: POST
2. URL: http://localhost:5000/api/orders
3. Body → raw → JSON
4. Paste the complete JSON above
5. Click "Send"
```

**Using cURL:**

```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userEmail": "john.doe@example.com",
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
      "email": "john.doe@example.com",
      "city": "Dhaka",
      "zone": "Mirpur",
      "address": "123 Main Street, Apartment 4B"
    },
    "paymentMethod": "cash-on-delivery",
    "couponCode": "SAVE150"
  }'
```

**Expected Response (Cash on Delivery):**

```json
{
  "ok": true,
  "order": {
    "_id": "order123",
    "orderId": "YH-20260328-001",
    "userEmail": "john.doe@example.com",
    "status": "created",
    "paymentStatus": "pending",
    "total": 4850,
    "items": [...],
    "billingDetails": {...},
    "confirmAfter": "2026-03-28T13:00:00.000Z",
    "createdAt": "2026-03-28T10:00:00.000Z"
  }
}
```

✅ **Order Created Successfully!**

**What happens next:**

1. Order is created with status "created"
2. You receive confirmation email
3. Admin receives notification
4. After 3 hours, order status automatically changes to "confirmed"
5. Admin can then process the order

---

### 5.3 Create Order with Online Payment

For online payment (Bkash, cards), change the `paymentMethod`:

**Request Body (only change this line):**

```json
{
  "paymentMethod": "online",
  ... (rest same as above)
}
```

**Expected Response (Online Payment):**

```json
{
  "ok": true,
  "order": {
    "_id": "order123",
    "orderId": "YH-20260328-001",
    "status": "created",
    "paymentStatus": "unpaid",
    "total": 4850
  },
  "paymentUrl": "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=MjAyNjAzMjg..."
}
```

**What to do with paymentUrl:**

1. Send this URL to your frontend
2. Redirect user to this URL
3. User completes payment
4. They get redirected back to your site
5. Order status updates automatically

---

### 5.4 View Your Orders

**Method:** GET
**URL:** `http://localhost:5000/api/orders/my`

**Using Postman:**

```
1. Method: GET
2. URL: http://localhost:5000/api/orders/my
3. Make sure you're logged in (cookie from Step 3)
4. Click "Send"
```

**Using cURL:**

```bash
curl http://localhost:5000/api/orders/my -b cookies.txt
```

**Expected Response:**

```json
{
  "orders": [
    {
      "_id": "order123",
      "orderId": "YH-20260328-001",
      "status": "delivered",
      "paymentStatus": "paid",
      "total": 4850,
      "items": [...],
      "createdAt": "2026-03-28T10:00:00.000Z"
    }
  ],
  "total": 5
}
```

---

### 5.5 View Single Order Details

**Method:** GET
**URL:** `http://localhost:5000/api/orders/order123`

Replace `order123` with your actual order ID.

```bash
curl http://localhost:5000/api/orders/order123
```

---

### 5.6 Cancel Order (within 30 minutes)

You can cancel COD orders within 30 minutes of creation.

**Method:** PATCH
**URL:** `http://localhost:5000/api/orders/order123/cancel`

**Using Postman:**

```
1. Method: PATCH
2. URL: http://localhost:5000/api/orders/order123/cancel
3. Make sure you're logged in
4. Click "Send"
```

**Using cURL:**

```bash
curl -X PATCH http://localhost:5000/api/orders/order123/cancel \
  -b cookies.txt
```

**Expected Response:**

```json
{
  "message": "Order cancelled successfully",
  "order": {
    "_id": "order123",
    "status": "cancelled",
    "paymentStatus": "refunded"
  }
}
```

### 5.7 Edit Order(within 30 minutes)

1.Method: Patch 2. URL: http://localhost:5000/api/orders/:id/edit 3. Make sure you're logged in 4. Click "Send"

{"items": [
{
"productId": "69a7efed7a26484a38065c9e",
"quantity": 3,
"color": "Red",
"size": "M"
}
]}

---

## Step 6: Admin Login

Now let's learn how to log in as an admin.

### 6.1 First-Time Admin Setup

If you don't have an admin account yet, you need to create one. But first, you need the admin secret from your `.env` file.

**Check your `.env` file:**

```
ADMIN_SECRET=your_admin_secret_key_here
```

---

### 6.2 Admin Login

**Method:** POST
**URL:** `http://localhost:5000/api/admin/login`
**Content-Type:** application/json

**Request Body:**

```json
{
  "email": "admin@SmartBuy BD.com",
  "password": "yourpassword123",
  "adminSecret": "your_admin_secret_key_here"
}
```

**Using Postman:**

```
1. Method: POST
2. URL: http://localhost:5000/api/admin/login
3. Body → raw → JSON
4. Paste:
   {
     "email": "admin@SmartBuy BD.com",
     "password": "yourpassword123",
     "adminSecret": "paste_your_ADMIN_SECRET_here"
   }
5. Click "Send"
```

**Using cURL:**

```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@SmartBuy BD.com",
    "password": "yourpassword123",
    "secret": "your_admin_secret"
  }' \
  -c admin_cookies.txt
```

**Expected Response:**

```json
{
  "ok": true,
  "admin": {
    "_id": "admin123",
    "email": "admin@SmartBuy BD.com",
    "name": "Admin Name",
    "role": "admin",
    "isActive": true
  }
}
```

✅ **You're now logged in as Admin!**

**⚠️ Important:**

- The admin secret is required for security
- Never share your admin secret publicly
- Use different cookies for user and admin (separate cookie files)

---

### 6.3 Verify Admin Login

**Method:** GET
**URL:** `http://localhost:5000/api/auth/me`

**Using cURL:**

```bash
curl http://localhost:5000/api/auth/me -b admin_cookies.txt
```

**Expected Response:**

```json
{
  "user": {
    "_id": "admin123",
    "email": "admin@SmartBuy BD.com",
    "role": "admin",
    "type": "admin"
  }
}
```

Note: `type: "admin"` confirms you're logged in as admin, not a regular user.

---

## Step 7: Admin Dashboard

Now let's explore the admin dashboard.

### 7.1 Get Dashboard Overview

**Method:** GET
**URL:** `http://localhost:5000/api/admin/dashboard-overview`

**Using Postman:**

```
1. Method: GET
2. URL: http://localhost:5000/api/admin/dashboard-overview
3. Make sure you're logged in as admin
4. Click "Send"
```

**Using cURL:**

```bash
curl http://localhost:5000/api/admin/dashboard-overview \
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
    "today": {
      "orders": 25,
      "sales": 125000,
      "profit": 37500
    },
    "yesterday": {
      "orders": 30,
      "sales": 150000,
      "profit": 45000
    },
    "last7Days": {
      "orders": 200,
      "sales": 1000000,
      "profit": 300000
    },
    "last30Days": {
      "orders": 800,
      "sales": 4000000,
      "profit": 1200000
    }
  },
  "orderFlow": {
    "created": 50,
    "pending": 15,
    "confirmed": 30,
    "processing": 20,
    "sentToCourier": 10,
    "delivered": 4500,
    "cancelled": 250,
    "failed": 125
  },
  "recentOrders": [...],
  "topSellingProducts": [...],
  "stock": {
    "outOfStockCount": 25,
    "lowStockCount": 50
  }
}
```

**What this shows:**

- Total revenue and profit
- Daily, weekly, monthly reports
- Order status breakdown
- Recent orders
- Best-selling products
- Stock alerts

---

## Step 8: Manage Products

### 8.1 Create a Category First

Before creating products, you need categories.

**Method:** POST
**URL:** `http://localhost:5000/api/admin/categories`
**Content-Type:** application/json

**Request Body:**

```json
{
  "name": "Electronics",
  "slug": "electronics",
  "image": "https://res.cloudinary.com/.../electronics.webp",
  "isActive": true
}
```

**Using Postman:**

```
1. Method: POST
2. URL: http://localhost:5000/api/admin/categories
3. Body → raw → JSON
4. Paste the JSON above
5. Make sure you're logged in as admin
6. Click "Send"
```

**Using cURL:**

```bash
curl -X POST http://localhost:5000/api/admin/categories \
  -H "Content-Type: application/json" \
  -b admin_cookies.txt \
  -d '{
    "name": "Electronics",
    "slug": "electronics",
    "image": "https://res.cloudinary.com/.../electronics.webp",
    "isActive": true
  }'
```

**Expected Response:**

```json
{
  "category": {
    "_id": "cat123",
    "name": "Electronics",
    "slug": "electronics",
    "level": 0,
    "position": 1,
    "isActive": true
  }
}
```

✅ **Category Created!** Save the `_id` (cat123) for the next step.

---

### 8.2 Upload Product Image

Before creating a product, let's upload an image.

**Method:** POST
**URL:** `http://localhost:5000/api/admin/upload`
**Content-Type:** multipart/form-data

**Using Postman:**

```
1. Method: POST
2. URL: http://localhost:5000/api/admin/upload
3. Body → form-data
4. Add field:
   - Key: image (change type to "File")
   - Value: Click "Select Files" and choose your image
5. Make sure you're logged in as admin
6. Click "Send"
```

**Using cURL:**

```bash
curl -X POST http://localhost:5000/api/admin/upload \
  -b admin_cookies.txt \
  -F "image=@/path/to/your/product-image.jpg"
```

**Expected Response:**

```json
{
  "url": "https://res.cloudinary.com/yourcloud/image/upload/v1234/SmartBuy BD/products/abc123.webp",
  "public_id": "SmartBuy BD/products/abc123"
}
```

✅ **Image Uploaded!** Copy the `url` for the next step.

---

### 8.3 Create a Product

Now let's create the actual product!

**Method:** POST
**URL:** `http://localhost:5000/api/admin/products`
**Content-Type:** application/json

**Request Body:**

```json
{
  "title": "Wireless Bluetooth Headphones",
  "slug": "wireless-bluetooth-headphones",
  "description": "High-quality wireless headphones with noise cancellation",
  "detailedDescription": "<p>Experience premium sound quality with our wireless Bluetooth headphones. Features include noise cancellation, 20-hour battery life, and comfortable ear cushions.</p>",
  "sku": "WBH-001",
  "price": 2500,
  "compareAtPrice": 3500,
  "images": [
    "https://res.cloudinary.com/.../product1.webp",
    "https://res.cloudinary.com/.../product2.webp"
  ],
  "categoryId": "cat123",
  "department": "Electronics",
  "tags": ["wireless", "bluetooth", "headphones", "audio"],
  "badges": ["best-seller", "new"],
  "colors": ["Black", "White", "Blue"],
  "sizes": [],
  "inventory": 100,
  "availability": "in-stock",
  "status": "published",
  "featured": true,
  "specs": [
    {
      "label": "Battery Life",
      "value": "20 hours"
    },
    {
      "label": "Connectivity",
      "value": "Bluetooth 5.0"
    },
    {
      "label": "Weight",
      "value": "250g"
    }
  ],
  "warranty": {
    "period": "1 year",
    "details": "Manufacturer warranty covers defects",
    "provider": "Brand Name"
  },
  "returnPolicy": {
    "days": 7,
    "refundable": true,
    "details": "Return unused items with original packaging"
  },
  "seo": {
    "title": "Buy Wireless Bluetooth Headphones - SmartBuy BD",
    "description": "Shop high-quality wireless Bluetooth headphones with noise cancellation. Free shipping on orders over 999৳",
    "keywords": [
      "wireless headphones",
      "bluetooth headphones",
      "noise cancellation"
    ]
  }
}
```

**Using Postman:**

```
1. Method: POST
2. URL: http://localhost:5000/api/admin/products
3. Body → raw → JSON
4. Paste the complete JSON above
5. Update the categoryId with your actual category ID
6. Update the images URLs with your uploaded images
7. Make sure you're logged in as admin
8. Click "Send"
```

**Using cURL:**

```bash
curl -X POST http://localhost:5000/api/admin/products \
  -H "Content-Type: application/json" \
  -b admin_cookies.txt \
  -d '{
    "title": "Wireless Bluetooth Headphones",
    "slug": "wireless-bluetooth-headphones",
    "price": 2500,
    "images": ["https://res.cloudinary.com/.../image.webp"],
    "categoryId": "cat123",
    "inventory": 100,
    "status": "published"
  }'
```

**Expected Response:**

```json
{
  "product": {
    "_id": "prod123",
    "title": "Wireless Bluetooth Headphones",
    "slug": "wireless-bluetooth-headphones",
    "price": 2500,
    "inventory": 100,
    "status": "published",
    "createdAt": "2026-03-28T10:00:00.000Z"
  }
}
```

✅ **Product Created Successfully!**

---

### 8.4 Update a Product

**Method:** PUT
**URL:** `http://localhost:5000/api/admin/products/prod123`
**Content-Type:** application/json

**Request Body (you can update any fields):**

```json
{
  "price": 2300,
  "inventory": 80,
  "featured": false
}
```

**Using Postman:**

```
1. Method: PUT
2. URL: http://localhost:5000/api/admin/products/prod123
3. Body → raw → JSON
4. Paste the JSON above
5. Click "Send"
```

---

### 8.5 Delete a Product (Soft Delete)

**Method:** DELETE
**URL:** `http://localhost:5000/api/admin/products/prod123`

This changes status to "archived" but doesn't actually delete it.

```bash
curl -X DELETE http://localhost:5000/api/admin/products/prod123 \
  -b admin_cookies.txt
```

---

### 8.6 Delete a Product (Permanently)

**Method:** DELETE
**URL:** `http://localhost:5000/api/admin/products/prod123?force=true`

This permanently removes the product from the database.

```bash
curl -X DELETE "http://localhost:5000/api/admin/products/prod123?force=true" \
  -b admin_cookies.txt
```

---

## Step 9: Manage Orders

### 9.1 View All Orders

**Method:** GET
**URL:** `http://localhost:5000/api/admin/orders`

**Using Postman:**

```
1. Method: GET
2. URL: http://localhost:5000/api/admin/orders
3. Make sure you're logged in as admin
4. Click "Send"
```

**With filters:**

```
http://localhost:5000/api/admin/orders?status=pending&page=1&limit=50
```

---

### 9.2 Update Order Status

**Method:** PUT
**URL:** `http://localhost:5000/api/admin/orders/order123/status`
**Content-Type:** application/json

**Request Body:**

```json
{
  "status": "confirmed"
}
```

**Available statuses:**

- `created` - Just created
- `pending` - Waiting for confirmation
- `confirmed` - Confirmed by admin
- `processing` - Being prepared
- `sent-to-courier` - Shipped
- `delivered` - Delivered to customer
- `cancelled` - Cancelled
- `failed` - Failed

**Using Postman:**

```
1. Method: PUT
2. URL: http://localhost:5000/api/admin/orders/order123/status
3. Body → raw → JSON
4. Paste: {"status": "confirmed"}
5. Click "Send"
```

**Expected Response:**

```json
{
  "message": "Order status updated",
  "order": {
    "_id": "order123",
    "status": "confirmed",
    "updatedAt": "2026-03-28T11:00:00.000Z"
  }
}
```

---

### 9.3 Update Payment Status

**Method:** PUT
**URL:** `http://localhost:5000/api/admin/orders/order123/payment-status`

**Request Body:**

```json
{
  "paymentStatus": "paid"
}
```

**Available payment statuses:**

- `pending` - Not paid yet
- `paid` - Paid
- `failed` - Payment failed
- `refunded` - Refunded

---

## Complete Use Cases

Let me show you complete real-world scenarios step by step.

### Use Case 1: Customer Browse and Order

**Scenario:** A customer wants to buy a product.

**Step-by-step:**

```bash
# Step 1: Customer logs in
curl -X POST http://localhost:5000/api/auth/firebase-login \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com","name":"Customer","provider":"password"}' \
  -c customer.txt

# Step 2: Browse products
curl http://localhost:5000/api/products?q=headphones

# Step 3: View product details (copy ID from step 2)
curl http://localhost:5000/api/products/prod123

# Step 4: Get price quote
curl -X POST http://localhost:5000/api/orders/quote \
  -H "Content-Type: application/json" \
  -d '{
    "items":[{"productId":"prod123","quantity":1}],
    "city":"Dhaka"
  }'

# Step 5: Create order
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -b customer.txt \
  -d '{
    "userEmail":"customer@example.com",
    "items":[{"productId":"prod123","quantity":1}],
    "billingDetails":{
      "name":"Customer Name",
      "phone":"+8801712345678",
      "email":"customer@example.com",
      "city":"Dhaka",
      "zone":"Mirpur",
      "address":"123 Street"
    },
    "paymentMethod":"cash-on-delivery"
  }'

# Step 6: View order history
curl http://localhost:5000/api/orders/my -b customer.txt
```

---

### Use Case 2: Admin Creates Product and Processes Order

**Scenario:** Admin adds a new product and processes an order.

**Step-by-step:**

```bash
# Step 1: Admin login
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@SmartBuy BD.com",
    "password":"yourpass",
    "secret":"your_admin_secret"
  }' \
  -c admin.txt

# Step 2: Create category
curl -X POST http://localhost:5000/api/admin/categories \
  -H "Content-Type: application/json" \
  -b admin.txt \
  -d '{
    "name":"Electronics",
    "slug":"electronics",
    "isActive":true
  }'
# (Save the category ID from response)

# Step 3: Upload image
curl -X POST http://localhost:5000/api/admin/upload \
  -b admin.txt \
  -F "image=@product.jpg"
# (Save the URL from response)

# Step 4: Create product
curl -X POST http://localhost:5000/api/admin/products \
  -H "Content-Type: application/json" \
  -b admin.txt \
  -d '{
    "title":"New Product",
    "slug":"new-product",
    "price":1500,
    "images":["https://cloudinary.com/..."],
    "categoryId":"cat123",
    "inventory":50,
    "status":"published"
  }'

# Step 5: View dashboard
curl http://localhost:5000/api/admin/dashboard-overview -b admin.txt

# Step 6: View pending orders
curl "http://localhost:5000/api/admin/orders?status=pending" -b admin.txt

# Step 7: Confirm an order
curl -X PUT http://localhost:5000/api/admin/orders/order123/status \
  -H "Content-Type: application/json" \
  -b admin.txt \
  -d '{"status":"confirmed"}'

# Step 8: Mark payment as received
curl -X PUT http://localhost:5000/api/admin/orders/order123/payment-status \
  -H "Content-Type: application/json" \
  -b admin.txt \
  -d '{"paymentStatus":"paid"}'
```

---

### Use Case 3: Customer Reviews a Product

**Scenario:** Customer bought a product and wants to leave a review.

**Step-by-step:**

```bash
# Step 1: Customer logs in
curl -X POST http://localhost:5000/api/auth/firebase-login \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com","name":"Customer","provider":"password"}' \
  -c customer.txt

# Step 2: Submit review
curl -X POST http://localhost:5000/api/products/prod123/reviews \
  -H "Content-Type: application/json" \
  -b customer.txt \
  -d '{
    "authorName":"John Doe",
    "rating":5,
    "title":"Excellent product!",
    "body":"I am very satisfied with this purchase. Great quality and fast delivery."
  }'

# Step 3: Ask a question
curl -X POST http://localhost:5000/api/products/prod123/questions \
  -H "Content-Type: application/json" \
  -b customer.txt \
  -d '{
    "question":"Does this come with a warranty?",
    "askerName":"John Doe"
  }'
```

---

## Important Notes

### Available Coupon Codes

You can use these coupon codes when creating orders:

- `NEWUSER26` - 50৳ off (new users only)
- `SAVE150` - 150৳ off (all users)
- `CASHBACK100` - 100৳ off (all users)

### Shipping Costs

- **FREE** if order total ≥ 999৳
- **70৳** for Dhaka
- **130৳** for outside Dhaka

### Auto Discounts

- Spend ≥ 2000৳ → Get 150৳ off
- Spend ≥ 3000৳ → Get 250৳ off

---

## Common Errors and Solutions

### Error: 401 Unauthorized

```json
{
  "error": "Authentication required. Please log in."
}
```

**Solution:** You're not logged in. Go back to Step 3 or Step 6 and log in.

---

### Error: 403 Forbidden

```json
{
  "error": "Insufficient permissions. Admin access required."
}
```

**Solution:** You're logged in as a regular user but trying to access admin endpoints. Log in as admin (Step 6).

---

### Error: 404 Not Found

```json
{
  "error": "Product not found"
}
```

**Solution:** The product ID you're using doesn't exist. Check the ID and try again.

---

### Error: 400 Bad Request

```json
{
  "error": "Price must be a positive number"
}
```

**Solution:** Your request data is invalid. Check the request body format and required fields.

---

### Error: Insufficient Stock

```json
{
  "error": "Insufficient stock. Only 5 items available."
}
```

**Solution:** The product doesn't have enough inventory. Reduce quantity or choose different product.

---

## Next Steps

Now that you know the basics, you can:

1. **Explore more endpoints** - Check `API_DOCUMENTATION.md` for all 81+ endpoints
2. **Build a frontend** - Use these APIs to build your e-commerce website
3. **Test payment flow** - Try online payment with test credentials
4. **Set up webhooks** - Configure SSLCommerz payment callbacks
5. **Create a mobile app** - Use the same APIs for mobile applications

---

## Quick Reference Card

**Save this for quick access:**

```
# Health Check
GET /api/auth/ping

# User Login
POST /api/auth/firebase-login
Body: {email, name, provider}

# Admin Login
POST /api/admin/login
Body: {email, password, secret}

# Browse Products
GET /api/products?q=search&minPrice=100&maxPrice=1000

# Create Order
POST /api/orders
Body: {userEmail, items, billingDetails, paymentMethod}

# Admin Dashboard
GET /api/admin/dashboard-overview

# Create Product
POST /api/admin/products
Body: {title, price, images, categoryId, inventory, status}

# Update Order Status
PUT /api/admin/orders/:id/status
Body: {status}
```

---

**Congratulations!** 🎉

You now know how to use the SmartBuy BD API from A to Z!

For more details, check out:

- `API_DOCUMENTATION.md` - Complete endpoint reference
- `API_QUICK_REFERENCE.md` - Quick lookup tables
- `API_TESTING_GUIDE.md` - Advanced testing scenarios
