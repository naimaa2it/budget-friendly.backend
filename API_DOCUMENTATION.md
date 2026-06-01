# yourHaat E-Commerce Platform - API Documentation

**Version:** 1.0.0
**Base URL:** `https://your-backend-domain.com` or `http://localhost:5000`
**Last Updated:** March 28, 2026

---

## Table of Contents

1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Products](#products)
4. [Blog](#blog)
5. [Orders & Payments](#orders--payments)
6. [Admin APIs](#admin-apis)
7. [Public Content APIs](#public-content-apis)
8. [Error Handling](#error-handling)
9. [Environment Setup](#environment-setup)

---

## Authentication

All authentication uses **httpOnly cookies** with JWT tokens.

### Cookie Details
- **Cookie Name:** `token`
- **Flags:** `httpOnly: true, sameSite: 'none', secure: true`
- **Expiry:** 7 days
- **Payload:**
  - User: `{ id, role }`
  - Admin: `{ id, role, type: 'admin' }`

### Base Path: `/api/auth`

#### 1. Ping (Health Check)
```http
GET /api/auth/ping
```

**Response:**
```json
{
  "message": "pong",
  "timestamp": "2026-03-28T10:00:00.000Z"
}
```

---

#### 2. Firebase Login (Google/Email)
```http
POST /api/auth/firebase-login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "image": "https://...",
  "provider": "google.com" // or "password"
}
```

**Response:**
```json
{
  "user": {
    "_id": "user123",
    "email": "user@example.com",
    "name": "John Doe",
    "image": "https://...",
    "role": "user",
    "provider": "google.com"
  }
}
```

**Notes:**
- Creates new user if doesn't exist
- Returns JWT in httpOnly cookie
- Auto-subscribes new users to newsletter

---

#### 3. Logout
```http
POST /api/auth/logout
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

---

#### 4. Get Current User
```http
GET /api/auth/me
```

**Headers:**
- Cookie: `token=<jwt_token>`

**Response (Authenticated):**
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

**Response (Not Authenticated):**
```json
{
  "user": null
}
```

---

## User Management

### Base Path: `/api/user`

**Authentication Required:** All endpoints require user JWT cookie

---

#### 1. Update Profile
```http
PUT /api/user/profile
```

**Content-Type:** `multipart/form-data`

**Form Data:**
```javascript
{
  "name": "John Doe",
  "email": "john@example.com",
  "mobile": "+8801712345678",
  "dob": "1990-01-01",
  "newsletterSubscribed": "true",
  "image": File, // Optional: new profile image
  "removeImage": "true" // Optional: remove existing image
}
```

**Response:**
```json
{
  "user": {
    "_id": "user123",
    "name": "John Doe",
    "email": "john@example.com",
    "mobile": "+8801712345678",
    "image": "https://cloudinary.../optimized.webp"
  }
}
```

**Notes:**
- Images are auto-optimized to WebP format
- Old images are automatically removed from Cloudinary

---

#### 2. Get Addresses
```http
GET /api/user/addresses
```

**Response:**
```json
{
  "addresses": [
    {
      "_id": "addr123",
      "fullName": "John Doe",
      "email": "john@example.com",
      "phone": "+8801712345678",
      "city": "Dhaka",
      "zone": "Mirpur",
      "address": "123 Main Street",
      "type": "home"
    }
  ]
}
```

---

#### 3. Add Address
```http
POST /api/user/addresses
```

**Request Body:**
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "+8801712345678",
  "city": "Dhaka",
  "zone": "Mirpur",
  "address": "123 Main Street",
  "type": "home" // or "office"
}
```

**Response:**
```json
{
  "address": {
    "_id": "addr123",
    "fullName": "John Doe",
    ...
  }
}
```

---

#### 4. Update Address
```http
PUT /api/user/addresses/:id
```

**Parameters:**
- `id` (string): Address ID

**Request Body:** Same as Add Address

**Response:**
```json
{
  "address": { /* updated address */ }
}
```

---

#### 5. Delete Address
```http
DELETE /api/user/addresses/:id
```

**Response:**
```json
{
  "message": "Address deleted successfully"
}
```

---

#### 6. Subscribe to Newsletter
```http
POST /api/user/subscribe
```

**Response:**
```json
{
  "message": "Subscribed successfully",
  "newsletterSubscribed": true
}
```

---

#### 7. Unsubscribe from Newsletter
```http
POST /api/user/unsubscribe
```

**Response:**
```json
{
  "message": "Unsubscribed successfully",
  "newsletterSubscribed": false
}
```

---

## Products

### Base Path: `/api/products`

---

### Public Endpoints

#### 1. List Products
```http
GET /api/products
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (searches title, description, tags) |
| `categoryId` | string | Filter by category IDs (comma-separated: `cat1,cat2`) |
| `badge` | string | Filter by badge (e.g., "best-seller", "new") |
| `flag` | string | Filter by flag: `featured`, `coupon`, `flash-sale`, `clearance`, `free-shipping` |
| `status` | string | Filter by status: `published`, `draft`, `archived` (default: published) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `sort` | string | Sort order: `position`, `newest`, `oldest`, `nameAsc`, `nameDesc`, `priceHigh`, `priceLow` |
| `minPrice` | number | Minimum price filter |
| `maxPrice` | number | Maximum price filter |
| `brand` | string | Filter by department/brand |
| `minRating` | number | Minimum average rating (1-5) |

**Example Request:**
```http
GET /api/products?categoryId=cat123&minPrice=500&maxPrice=2000&sort=priceLow&page=1&limit=20
```

**Response:**
```json
{
  "ok": true,
  "products": [
    {
      "_id": "prod123",
      "title": "Product Name",
      "slug": "product-name",
      "price": 1500,
      "compareAtPrice": 2000,
      "images": ["https://..."],
      "badges": ["best-seller"],
      "averageRating": 4.5,
      "reviewCount": 42,
      "inventory": 50,
      "availability": "in-stock",
      "department": "Electronics",
      "categoryId": "cat123",
      ...
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

---

#### 2. Get Category Tree
```http
GET /api/products/categories
```

**Response:**
```json
{
  "categories": [
    {
      "_id": "cat1",
      "name": "Electronics",
      "slug": "electronics",
      "image": "https://...",
      "children": [
        {
          "_id": "cat2",
          "name": "Mobile Phones",
          "slug": "mobile-phones",
          "parentId": "cat1",
          "children": []
        }
      ]
    }
  ]
}
```

---

#### 3. Get Single Product
```http
GET /api/products/:id
```

**Parameters:**
- `id` (string): Product ID or slug

**Response:**
```json
{
  "product": {
    "_id": "prod123",
    "title": "Product Name",
    "slug": "product-name",
    "description": "Short description",
    "detailedDescription": "<p>Full HTML description</p>",
    "price": 1500,
    "compareAtPrice": 2000,
    "images": ["https://..."],
    "variants": [
      {
        "color": "Red",
        "size": "M",
        "sku": "PROD-RED-M",
        "price": 1500,
        "inventory": 10
      }
    ],
    "colors": ["Red", "Blue"],
    "sizes": ["S", "M", "L"],
    "inventory": 50,
    "availability": "in-stock",
    "badges": ["best-seller"],
    "featured": true,
    "department": "Fashion",
    "category": "T-Shirts",
    "categoryId": "cat123",
    "specs": [
      { "label": "Material", "value": "Cotton" }
    ],
    "guidelines": ["Machine washable"],
    "specifications": ["100% Cotton", "Made in Bangladesh"],
    "customization": {
      "customizable": true,
      "options": [
        {
          "name": "Add Name",
          "type": "text",
          "priceModifier": 50
        }
      ]
    },
    "warranty": {
      "period": "1 year",
      "details": "Manufacturer warranty",
      "provider": "Brand Name"
    },
    "returnPolicy": {
      "days": 7,
      "refundable": true,
      "details": "Unused items with tags"
    },
    "averageRating": 4.5,
    "reviewCount": 42,
    "reviews": [
      {
        "user": "user123",
        "authorName": "John Doe",
        "rating": 5,
        "title": "Great product!",
        "body": "Really satisfied with this purchase.",
        "helpful": 12,
        "createdAt": "2026-03-20T10:00:00.000Z"
      }
    ],
    "faqs": [
      {
        "question": "Is this waterproof?",
        "user": "user456",
        "askerName": "Jane Smith",
        "createdAt": "2026-03-15T10:00:00.000Z",
        "answers": [
          {
            "body": "Yes, it's water-resistant.",
            "authorName": "Admin",
            "isOfficial": true,
            "createdAt": "2026-03-16T10:00:00.000Z"
          }
        ]
      }
    ],
    "frequentlyBoughtTogether": [
      { /* populated product objects */ }
    ],
    "monthlySold": 150,
    "rewardPoints": 75,
    "seo": {
      "title": "SEO Title",
      "description": "SEO Description",
      "keywords": ["keyword1", "keyword2"]
    },
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-03-28T10:00:00.000Z"
  }
}
```

---

#### 4. Upload Product Image
```http
POST /api/products/upload
```

**Content-Type:** `multipart/form-data`

**Form Data:**
```javascript
{
  "image": File // JPEG, PNG, WebP, AVIF (max 10MB)
}
```

**Response:**
```json
{
  "url": "https://res.cloudinary.com/.../optimized.webp",
  "public_id": "yourhaat/products/abc123"
}
```

**Notes:**
- Auto-rotated based on EXIF orientation
- Resized to max 1600px width
- Converted to WebP format (quality 75)
- Uploaded to Cloudinary

---

### Review Endpoints (User Auth Required)

#### 5. Submit Product Review
```http
POST /api/products/:id/reviews
```

**Authentication:** User JWT required

**Request Body:**
```json
{
  "authorName": "John Doe",
  "rating": 5,
  "title": "Great product!",
  "body": "I'm very satisfied with this purchase. Highly recommended!"
}
```

**Validation:**
- `rating`: Required, integer 1-5
- `authorName`: Required, max 100 chars
- `body`: Required, max 2000 chars
- `title`: Optional, max 200 chars

**Response:**
```json
{
  "review": {
    "user": "user123",
    "authorName": "John Doe",
    "rating": 5,
    "title": "Great product!",
    "body": "I'm very satisfied...",
    "helpful": 0,
    "createdAt": "2026-03-28T10:00:00.000Z"
  }
}
```

---

#### 6. Edit Own Review
```http
PUT /api/products/:id/reviews/:index
```

**Parameters:**
- `id`: Product ID
- `index`: Review index in array

**Request Body:** Same as Submit Review

**Authorization:** Only the review author can edit

**Response:**
```json
{
  "message": "Review updated",
  "review": { /* updated review */ }
}
```

---

### Question & Answer Endpoints (User Auth Required)

#### 7. Ask Question
```http
POST /api/products/:id/questions
```

**Request Body:**
```json
{
  "question": "Does this come with a warranty?",
  "askerName": "Jane Smith"
}
```

**Response:**
```json
{
  "message": "Question submitted successfully",
  "question": {
    "question": "Does this come with a warranty?",
    "user": "user123",
    "askerName": "Jane Smith",
    "createdAt": "2026-03-28T10:00:00.000Z",
    "answers": []
  }
}
```

---

#### 8. Edit Own Question
```http
PUT /api/products/:id/questions/:index
```

**Request Body:**
```json
{
  "question": "Updated question text?"
}
```

---

#### 9. Submit Community Answer
```http
POST /api/products/:id/questions/:qIdx/answers
```

**Parameters:**
- `id`: Product ID
- `qIdx`: Question index

**Request Body:**
```json
{
  "body": "Yes, it comes with a 1-year warranty.",
  "authorName": "John Doe"
}
```

**Response:**
```json
{
  "message": "Answer submitted",
  "answer": {
    "body": "Yes, it comes with...",
    "authorName": "John Doe",
    "user": "user123",
    "isOfficial": false,
    "helpful": 0,
    "createdAt": "2026-03-28T10:00:00.000Z"
  }
}
```

---

#### 10. Edit Own Answer
```http
PUT /api/products/:id/questions/:qIdx/answers/:aIdx
```

**Parameters:**
- `aIdx`: Answer index

**Request Body:**
```json
{
  "body": "Updated answer text"
}
```

---

#### 11. Vote Answer as Helpful
```http
POST /api/products/:id/questions/:qIdx/answers/:aIdx/helpful
```

**Response:**
```json
{
  "message": "Vote toggled",
  "helpful": 5,
  "userVoted": true
}
```

**Notes:**
- Toggles helpful vote (add/remove)
- Prevents duplicate votes
- Returns updated count

---

### Admin Review/Question Management

#### 12. Get All Reviews (Admin)
```http
GET /api/products/admin-reviews
```

**Authentication:** Admin JWT required

**Query Parameters:**
- `page`, `limit`: Pagination
- `productId`: Filter by product
- `minRating`, `maxRating`: Rating filters

**Response:**
```json
{
  "reviews": [
    {
      "productId": "prod123",
      "productTitle": "Product Name",
      "index": 0,
      "review": { /* review object */ }
    }
  ],
  "total": 500
}
```

---

#### 13. Get All Questions (Admin)
```http
GET /api/products/admin-questions
```

**Response:**
```json
{
  "questions": [
    {
      "productId": "prod123",
      "productTitle": "Product Name",
      "index": 0,
      "question": { /* question object with answers */ }
    }
  ],
  "total": 200
}
```

---

#### 14. Edit Any Review (Admin)
```http
PUT /api/products/admin-reviews/:productId/:index
```

**Request Body:**
```json
{
  "authorName": "Updated Name",
  "rating": 4,
  "title": "Updated title",
  "body": "Updated content"
}
```

---

#### 15. Delete Review (Admin)
```http
DELETE /api/products/:id/reviews/:index
```

---

#### 16. Answer/Edit Question (Admin)
```http
PUT /api/products/admin-questions/:productId/:index
```

**Request Body:**
```json
{
  "officialAnswer": "This is the official response from our team."
}
```

**Notes:**
- Adds an answer marked as `isOfficial: true`
- Displays as "Official Answer" on frontend

---

#### 17. Delete Question (Admin)
```http
DELETE /api/products/admin-questions/:productId/:index
```

---

#### 18. Delete Answer (Admin)
```http
DELETE /api/products/admin-questions/:productId/:qIdx/answers/:aIdx
```

---

## Blog

### Base Path: `/api/blog`

#### 1. List Blog Posts
```http
GET /api/blog
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 10, max: 50) |
| `q` | string | Search query (title, content, excerpt) |
| `tag` | string | Filter by tag |

**Response:**
```json
{
  "posts": [
    {
      "_id": "post123",
      "title": "Blog Post Title",
      "slug": "blog-post-title",
      "excerpt": "Short preview text...",
      "coverImage": "https://...",
      "author": {
        "name": "Admin Name",
        "avatar": "https://..."
      },
      "tags": ["fashion", "tips"],
      "publishedAt": "2026-03-28T10:00:00.000Z",
      "readTime": "5 min read"
    }
  ],
  "total": 50,
  "page": 1,
  "totalPages": 5
}
```

---

#### 2. Get Single Post
```http
GET /api/blog/:slug
```

**Parameters:**
- `slug` (string): Post slug

**Response:**
```json
{
  "post": {
    "_id": "post123",
    "title": "Full Blog Post Title",
    "slug": "blog-post-title",
    "content": "<p>Full HTML content...</p>",
    "excerpt": "Short preview...",
    "coverImage": "https://...",
    "author": {
      "name": "Admin Name",
      "avatar": "https://...",
      "bio": "Author bio"
    },
    "tags": ["fashion", "tips"],
    "seo": {
      "title": "SEO Title",
      "description": "SEO Description",
      "keywords": ["keyword1"]
    },
    "publishedAt": "2026-03-28T10:00:00.000Z",
    "updatedAt": "2026-03-28T12:00:00.000Z",
    "readTime": "5 min read",
    "views": 1250
  }
}
```

---

#### 3. Get Related Blog Posts
```http
GET /api/blog/:slug/related
```

**Parameters:**
- `slug` (string): Current post slug

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 3 | Number of related posts to return |

**Description:** 
Returns related blog posts based on matching categories and tags. If not enough related posts are found, fills with latest published posts.

**Response:**
```json
{
  "relatedPosts": [
    {
      "_id": "post456",
      "title": "Related Post Title",
      "slug": "related-post-slug",
      "excerpt": "Short preview text...",
      "featuredImage": {
        "url": "https://...",
        "width": 1200,
        "height": 800
      },
      "featuredImageLegacy": "https://...",
      "author": "Author Name",
      "publishedAt": "2026-03-28T10:00:00.000Z",
      "readingTime": 5,
      "tags": ["tag1", "tag2"]
    }
  ]
}
```

**Example Request:**
```bash
GET /api/blog/top-10-smart-home-devices/related?limit=3
```

---

## Orders & Payments

### Base Path: `/api/orders`

---

### Public/User Endpoints

#### 1. Get Price Quote (Preview)
```http
POST /api/orders/quote
```

**Description:** Calculate order total without creating order

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

**Response:**
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
  ],
  "shippingDetails": {
    "method": "Home Delivery",
    "cost": 0,
    "freeShippingThreshold": 999
  }
}
```

**Validation:**
- Checks product availability
- Validates variant stock
- Applies coupon rules
- Calculates shipping based on city

---

#### 2. Create Order
```http
POST /api/orders
```

**Request Body:**
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
    "address": "123 Main Street, Apt 4B",
    "note": "Please call before delivery"
  },
  "paymentMethod": "cash-on-delivery", // or "online" or "bkash"
  "couponCode": "SAVE150"
}
```

**Validation Rules:**
- All billing fields required except `note`
- `phone`: Must be valid BD format
- `paymentMethod`: `cash-on-delivery`, `online`, `bkash`
- Inventory checked and decremented

**Response (COD):**
```json
{
  "ok": true,
  "order": {
    "_id": "order123",
    "orderId": "YH-20260328-001",
    "status": "created",
    "paymentStatus": "pending",
    "total": 2850,
    "items": [...],
    "billingDetails": {...},
    "confirmAfter": "2026-03-28T13:00:00.000Z",
    "createdAt": "2026-03-28T10:00:00.000Z"
  }
}
```

**Response (Online Payment):**
```json
{
  "ok": true,
  "order": { /* order object */ },
  "paymentUrl": "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=..."
}
```

**Notes:**
- COD orders auto-confirm after 3 hours
- Online payment redirects to SSLCommerz gateway
- Email sent to customer and admin
- Inventory decremented immediately

---

#### 3. Get My Orders
```http
GET /api/orders/my
```

**Authentication:** User JWT required

**Query Parameters:**
- `page`, `limit`: Pagination
- `status`: Filter by status

**Response:**
```json
{
  "orders": [
    {
      "_id": "order123",
      "orderId": "YH-20260328-001",
      "status": "delivered",
      "paymentStatus": "paid",
      "total": 2850,
      "items": [...],
      "createdAt": "2026-03-28T10:00:00.000Z"
    }
  ],
  "total": 25
}
```

---

#### 4. Get Single Order
```http
GET /api/orders/:id
```

**Parameters:**
- `id` (string): Order ID

**Response:**
```json
{
  "order": {
    "_id": "order123",
    "orderId": "YH-20260328-001",
    "userEmail": "customer@example.com",
    "items": [
      {
        "productId": "prod123",
        "title": "Product Name",
        "image": "https://...",
        "price": 1500,
        "quantity": 2,
        "color": "Red",
        "size": "M",
        "subtotal": 3000
      }
    ],
    "billingDetails": {...},
    "subtotal": 3000,
    "shipping": 70,
    "discount": 150,
    "total": 2920,
    "couponCode": "SAVE150",
    "paymentMethod": "online",
    "status": "pending",
    "paymentStatus": "paid",
    "transactionId": "TXN123456",
    "valId": "VAL789",
    "paidAmount": 2920,
    "confirmAfter": "2026-03-28T13:00:00.000Z",
    "createdAt": "2026-03-28T10:00:00.000Z",
    "updatedAt": "2026-03-28T10:30:00.000Z"
  }
}
```

---

#### 5. Retry Payment
```http
POST /api/orders/:id/pay
```

**Authentication:** User JWT required (order owner)

**Use Case:** Retry payment for failed/unpaid orders

**Response:**
```json
{
  "ok": true,
  "paymentUrl": "https://sandbox.sslcommerz.com/..."
}
```

**Restrictions:**
- Only for `unpaid` or `failed` payment status
- Order must not be `cancelled` or `delivered`

---

#### 6. Cancel Order
```http
PATCH /api/orders/:id/cancel
```

**Authentication:** User JWT required (order owner)

**Restrictions:**
- Only COD orders
- Within 30 minutes of creation
- Cannot cancel if status is `processing`, `sent-to-courier`, or `delivered`

**Response:**
```json
{
  "message": "Order cancelled successfully",
  "order": {
    "status": "cancelled",
    ...
  }
}
```

**Notes:**
- Inventory is restored
- Email notification sent

---

#### 7. Edit Order
```http
PATCH /api/orders/:id/edit
```

**Authentication:** User JWT required (order owner)

**Request Body:**
```json
{
  "billingDetails": {
    "name": "Updated Name",
    "phone": "+8801712345679",
    "address": "New Address"
  }
}
```

**Restrictions:**
- Within 30 minutes of creation
- Cannot edit if `processing`, `sent-to-courier`, or `delivered`

---

### Payment Callbacks (SSLCommerz)

#### 8. Payment Success
```http
POST /api/orders/payment/success
```

**Called by:** SSLCommerz after successful payment

**Form Data:**
- `tran_id`: Transaction ID
- `val_id`: Validation ID
- `amount`: Paid amount
- `status`: VALID or VALIDATED
- `card_type`, `card_issuer`, etc.

**Action:**
- Validates payment with SSLCommerz API
- Updates order status to `pending`
- Marks payment as `paid`
- Redirects to frontend success page

---

#### 9. Payment Failure
```http
POST /api/orders/payment/fail
```

**Action:**
- Marks payment as `failed`
- Inventory restored
- Redirects to frontend failure page

---

#### 10. Payment Cancellation
```http
POST /api/orders/payment/cancel
```

**Action:**
- Marks payment as `cancelled`
- Inventory restored
- Redirects to frontend

---

#### 11. IPN (Instant Payment Notification)
```http
POST /api/orders/payment/ipn
```

**Description:** Background verification callback from SSLCommerz

---

### Pricing Logic

#### Shipping Costs
```javascript
if (subtotal >= 999) {
  shipping = 0; // Free shipping
} else if (city === "Dhaka") {
  shipping = 70;
} else {
  shipping = 130;
}
```

#### Active Coupons
| Code | Type | Discount | Min Purchase | Conditions |
|------|------|----------|--------------|------------|
| `NEWUSER26` | Flat | 50৳ | None | New users only |
| `SAVE150` | Flat | 150৳ | None | All users |
| `CASHBACK100` | Flat | 100৳ | None | All users |

#### Auto Discounts
- ≥ 2000৳: 150৳ off
- ≥ 3000৳: 250৳ off

**Priority:** Coupon applied first, then auto-discount (whichever is higher)

---

## Admin APIs

### Base Path: `/api/admin`

**Authentication:** All endpoints require admin JWT cookie (except login/register)

---

### Admin Authentication

#### 1. Check Email
```http
POST /api/admin/check-email
```

**Request Body:**
```json
{
  "email": "admin@example.com"
}
```

**Response:**
```json
{
  "exists": true
}
```

---

#### 2. Admin Login
```http
POST /api/admin/login
```

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "your_password",
  "secret": "admin_secret_key"
}
```

**Validation:**
- `secret` must match `ADMIN_SECRET` environment variable
- Max 5 failed login attempts
- Account locks for 2 hours after max attempts

**Response:**
```json
{
  "ok": true,
  "admin": {
    "_id": "admin123",
    "email": "admin@example.com",
    "name": "Admin Name",
    "role": "admin",
    "isActive": true
  }
}
```

**Error (Account Locked):**
```json
{
  "error": "Too many failed attempts. Try again after 2 hours.",
  "statusCode": 423
}
```

---

#### 3. Forgot Password
```http
POST /api/admin/forgot
```

**Request Body:**
```json
{
  "email": "admin@example.com"
}
```

**Response:**
```json
{
  "message": "Password reset email sent"
}
```

**Notes:**
- Generates 6-digit reset code
- Valid for 1 hour
- Sends email with reset link

---

#### 4. Reset Password
```http
POST /api/admin/reset
```

**Request Body:**
```json
{
  "token": "123456",
  "password": "new_password"
}
```

**Response:**
```json
{
  "message": "Password reset successfully"
}
```

---

### File Upload

#### 5. Upload Image
```http
POST /api/admin/upload
```

**Content-Type:** `multipart/form-data`

**Form Data:**
```javascript
{
  "image": File,
  "folder": "banners" // Optional: products, banners, blog, etc.
}
```

**Response:**
```json
{
  "url": "https://res.cloudinary.com/.../optimized.webp",
  "public_id": "yourhaat/banners/abc123"
}
```

---

### Settings

#### 6. Get Top Banner (Public)
```http
GET /api/admin/top-banner
```

**No authentication required**

**Response:**
```json
{
  "settings": {
    "topBannerText": "Free shipping on orders over 999৳",
    "topBannerLink": "/shop",
    "topBannerEnabled": true,
    "adsenseEnabled": true,
    "adsenseClient": "ca-pub-123456",
    "adsenseSlot": "987654"
  }
}
```

---

#### 7. Get All Settings
```http
GET /api/admin/settings
```

**Response:**
```json
{
  "settings": {
    "storeName": "yourHaat",
    "storeEmail": "support@yourhaat.com",
    "storePhone": "+8801712345678",
    "topBannerText": "...",
    "topBannerEnabled": true,
    "adsenseEnabled": true,
    "adsenseClient": "ca-pub-123456",
    "adsenseSlot": "987654",
    "stockThreshold": 10,
    "lowStockAlert": true,
    "orderNotificationEmail": "orders@yourhaat.com",
    ...
  }
}
```

---

#### 8. Update Settings
```http
PUT /api/admin/settings
```

**Request Body:** Partial settings object

```json
{
  "topBannerText": "New banner text",
  "topBannerEnabled": false,
  "stockThreshold": 5
}
```

---

### Categories

#### 9. List Categories
```http
GET /api/admin/categories
```

**Query Parameters:**
- `includeInactive`: Include inactive categories

**Response:**
```json
{
  "categories": [
    {
      "_id": "cat123",
      "name": "Electronics",
      "slug": "electronics",
      "image": "https://...",
      "parentId": null,
      "level": 0,
      "isActive": true,
      "position": 1,
      "productCount": 150
    }
  ]
}
```

---

#### 10. Get Single Category
```http
GET /api/admin/categories/:id
```

---

#### 11. Create Category
```http
POST /api/admin/categories
```

**Request Body:**
```json
{
  "name": "Electronics",
  "slug": "electronics",
  "image": "https://...",
  "parentId": null,
  "isActive": true
}
```

**Validation:**
- Max 10 categories per parent
- Max depth: 2 levels (parent → child → grandchild)
- Slug must be unique

**Response:**
```json
{
  "category": {
    "_id": "cat123",
    "name": "Electronics",
    "slug": "electronics",
    "level": 0,
    "position": 1
  }
}
```

---

#### 12. Update Category
```http
PUT /api/admin/categories/:id
```

---

#### 13. Delete Category
```http
DELETE /api/admin/categories/:id
```

**Restrictions:**
- Cannot delete if has children categories
- Cannot delete if has products assigned

---

### Products (Admin)

#### 14. List Products
```http
GET /api/admin/products
```

**Query Parameters:**
- `page`, `limit`: Pagination
- `q`: Search query
- `status`: Filter by status
- `categoryId`: Filter by category
- All other filters from public product list

**Response:**
```json
{
  "products": [...],
  "total": 500,
  "page": 1,
  "totalPages": 25
}
```

---

#### 15. Create Product
```http
POST /api/admin/products
```

**Request Body:**
```json
{
  "title": "Product Name",
  "slug": "product-name",
  "description": "Short description",
  "detailedDescription": "<p>HTML content</p>",
  "sku": "PROD-001",
  "price": 1500,
  "compareAtPrice": 2000,
  "images": ["https://..."],
  "categoryId": "cat123",
  "department": "Fashion",
  "tags": ["new", "trending"],
  "badges": ["best-seller"],
  "variants": [
    {
      "color": "Red",
      "size": "M",
      "sku": "PROD-RED-M",
      "price": 1500,
      "inventory": 10
    }
  ],
  "colors": ["Red", "Blue"],
  "sizes": ["S", "M", "L"],
  "inventory": 50,
  "availability": "in-stock",
  "status": "published",
  "featured": false,
  "coupon": false,
  "flashSale": false,
  "specs": [
    { "label": "Material", "value": "Cotton" }
  ],
  "customization": {
    "customizable": true,
    "options": [
      {
        "name": "Add Name",
        "type": "text",
        "priceModifier": 50
      }
    ]
  },
  "warranty": {
    "period": "1 year",
    "details": "Manufacturer warranty",
    "provider": "Brand"
  },
  "returnPolicy": {
    "days": 7,
    "refundable": true,
    "details": "Unused with tags"
  },
  "frequentlyBoughtTogether": ["prod456", "prod789"],
  "seo": {
    "title": "SEO Title",
    "description": "SEO Description",
    "keywords": ["keyword1"]
  }
}
```

**Response:**
```json
{
  "product": { /* created product */ }
}
```

---

#### 16. Get Single Product (Admin)
```http
GET /api/admin/products/:id
```

---

#### 17. Update Product
```http
PUT /api/admin/products/:id
```

**Request Body:** Same as Create Product (partial)

---

#### 18. Delete Product
```http
DELETE /api/admin/products/:id?force=false
```

**Query Parameters:**
- `force=true`: Permanently delete
- `force=false` (default): Soft delete (sets status to archived)

**Response:**
```json
{
  "message": "Product deleted successfully"
}
```

**Notes:**
- Soft delete preserves product data
- Force delete removes from database
- Images remain in Cloudinary (manual cleanup required)

---

### Blog (Admin)

#### 19. List Blog Posts
```http
GET /api/admin/blog
```

**Query Parameters:**
- `page`, `limit`: Pagination
- `status`: `published`, `draft`, `archived`
- `q`: Search query

---

#### 20. Create Blog Post
```http
POST /api/admin/blog
```

**Request Body:**
```json
{
  "title": "Blog Post Title",
  "slug": "blog-post-title",
  "content": "<p>Full HTML content</p>",
  "excerpt": "Short preview",
  "coverImage": "https://...",
  "author": {
    "name": "Admin Name",
    "avatar": "https://...",
    "bio": "Author bio"
  },
  "tags": ["fashion", "tips"],
  "status": "published",
  "publishedAt": "2026-03-28T10:00:00.000Z",
  "seo": {
    "title": "SEO Title",
    "description": "SEO Description",
    "keywords": ["keyword1"]
  }
}
```

---

#### 21. Get Single Post (Admin)
```http
GET /api/admin/blog/:id
```

---

#### 22. Update Blog Post
```http
PUT /api/admin/blog/:id
```

---

#### 23. Delete Blog Post
```http
DELETE /api/admin/blog/:id
```

**Notes:**
- Archives post (soft delete)
- Sets status to `archived`

---

### User Management

#### 24. List Users
```http
GET /api/admin/users
```

**Query Parameters:**
- `page`, `limit`: Pagination (max 200 per page)
- `q`: Search by name, email, or phone

**Response:**
```json
{
  "users": [
    {
      "_id": "user123",
      "email": "user@example.com",
      "name": "John Doe",
      "mobile": "+8801712345678",
      "role": "user",
      "provider": "google.com",
      "newsletterSubscribed": true,
      "createdAt": "2026-01-15T10:00:00.000Z"
    }
  ],
  "total": 1500
}
```

---

#### 25. Get Single User
```http
GET /api/admin/users/:id
```

---

#### 26. Update User
```http
PUT /api/admin/users/:id
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "email": "newemail@example.com",
  "mobile": "+8801712345678",
  "role": "user",
  "newsletterSubscribed": true
}
```

---

#### 27. Delete User
```http
DELETE /api/admin/users/:id
```

**Notes:**
- Permanently deletes user
- Removes profile image from Cloudinary
- Deletes all user addresses

---

### Admin Account Management

#### 28. List Admins
```http
GET /api/admin/admins
```

**Response:**
```json
{
  "admins": [
    {
      "_id": "admin123",
      "email": "admin@example.com",
      "name": "Admin Name",
      "role": "admin",
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z"
    },
    {
      "_id": "mod123",
      "email": "moderator@example.com",
      "name": "Moderator Name",
      "role": "moderator",
      "isActive": true
    }
  ]
}
```

---

#### 29. Get Single Admin
```http
GET /api/admin/admins/:id
```

---

#### 30. Create Admin/Moderator
```http
POST /api/admin/admins
```

**Request Body:**
```json
{
  "email": "newadmin@example.com",
  "name": "New Admin",
  "password": "secure_password",
  "role": "admin", // or "moderator"
  "secret": "admin_secret_key"
}
```

**Validation:**
- `secret` must match `ADMIN_SECRET`
- Password min 8 characters
- Email must be unique

---

#### 31. Update Admin
```http
PUT /api/admin/admins/:id
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "email": "updated@example.com",
  "role": "moderator",
  "password": "new_password" // optional
}
```

---

#### 32. Deactivate Admin
```http
DELETE /api/admin/admins/:id
```

**Notes:**
- Soft delete: sets `isActive` to false
- Admin can't delete themselves
- Deactivated admins can't log in

---

### Occasion Sections

#### 33. List Occasions
```http
GET /api/admin/occasions
```

**Response:**
```json
{
  "occasions": [
    {
      "_id": "occ123",
      "title": "Eid Collection",
      "subtitle": "Special offers",
      "backgroundColor": "#ff6b6b",
      "textColor": "#ffffff",
      "backgroundImage": "https://...",
      "productIds": ["prod1", "prod2"],
      "isActive": true,
      "order": 1
    }
  ]
}
```

---

#### 34. Create Occasion
```http
POST /api/admin/occasions
```

**Request Body:**
```json
{
  "title": "Eid Collection",
  "subtitle": "Special offers",
  "backgroundColor": "#ff6b6b",
  "textColor": "#ffffff",
  "backgroundImage": "https://...",
  "productIds": ["prod1", "prod2"],
  "isActive": true
}
```

---

#### 35. Get Single Occasion
```http
GET /api/admin/occasions/:id
```

---

#### 36. Update Occasion
```http
PUT /api/admin/occasions/:id
```

---

#### 37. Delete Occasion
```http
DELETE /api/admin/occasions/:id
```

---

#### 38. Reorder Occasions
```http
PUT /api/admin/occasions-reorder
```

**Request Body:**
```json
{
  "updates": [
    { "id": "occ1", "order": 1 },
    { "id": "occ2", "order": 2 }
  ]
}
```

---

### Featured Sections

#### 39-44. Featured Section Endpoints
Same CRUD structure as Occasions:
- `GET /api/admin/featured`
- `POST /api/admin/featured`
- `GET /api/admin/featured/:id`
- `PUT /api/admin/featured/:id`
- `DELETE /api/admin/featured/:id`
- `PUT /api/admin/featured-reorder`

**Schema:**
```json
{
  "title": "Best Sellers",
  "productIds": ["prod1", "prod2"],
  "isActive": true,
  "order": 1
}
```

---

### Promo Strip

#### 45-50. Promo Strip Endpoints
Same structure as above:
- `GET /api/admin/promo-strip`
- `POST /api/admin/promo-strip`
- `GET /api/admin/promo-strip/:id`
- `PUT /api/admin/promo-strip/:id`
- `DELETE /api/admin/promo-strip/:id`
- `PUT /api/admin/promo-strip-reorder`

**Schema:**
```json
{
  "text": "Free Shipping",
  "icon": "📦",
  "isActive": true,
  "order": 1
}
```

---

### Banners

#### 51. List Banners
```http
GET /api/admin/banners
```

---

#### 52. Create Banner
```http
POST /api/admin/banners
```

**Request Body:**
```json
{
  "title": "Summer Sale",
  "desktopImage": "https://...",
  "mobileImage": "https://...",
  "desktopPublicId": "yourhaat/banners/desktop123",
  "mobilePublicId": "yourhaat/banners/mobile123",
  "link": "/shop/summer-sale",
  "isActive": true
}
```

---

#### 53. Update Banner
```http
PUT /api/admin/banners/:id
```

---

#### 54. Delete Banner
```http
DELETE /api/admin/banners/:id
```

**Notes:**
- Deletes images from Cloudinary using public_ids
- Permanently removes banner

---

#### 55. Reorder Banners
```http
PUT /api/admin/banners-reorder
```

---

### Promo Panels

#### 56-61. Promo Panel Endpoints
Same CRUD structure:
- `GET /api/admin/promo-panels`
- `POST /api/admin/promo-panels`
- `GET /api/admin/promo-panels/:id`
- `PUT /api/admin/promo-panels/:id`
- `DELETE /api/admin/promo-panels/:id`
- `PUT /api/admin/promo-panels-reorder`

**Schema:**
```json
{
  "title": "Gift Cards",
  "image": "https://...",
  "link": "/gift-cards",
  "isActive": true,
  "order": 1
}
```

---

### Popup (Singleton)

#### 62. Get Popup
```http
GET /api/admin/popup
```

**Response:**
```json
{
  "popup": {
    "_id": "popup123",
    "title": "Subscribe for 10% Off!",
    "description": "Get exclusive deals",
    "image": "https://...",
    "ctaText": "Subscribe",
    "ctaLink": "/subscribe",
    "isActive": true,
    "delaySeconds": 3,
    "showFrequency": "once" // or "always", "daily"
  }
}
```

---

#### 63. Upsert Popup
```http
PUT /api/admin/popup
```

**Request Body:**
```json
{
  "title": "Subscribe for 10% Off!",
  "description": "Get exclusive deals",
  "image": "https://...",
  "ctaText": "Subscribe",
  "ctaLink": "/subscribe",
  "isActive": true,
  "delaySeconds": 3,
  "showFrequency": "once"
}
```

**Notes:**
- Creates if doesn't exist, updates if exists
- Only one popup per site

---

#### 64. Delete Popup
```http
DELETE /api/admin/popup
```

---

### Media Library (Cloudinary)

#### 65. List Media
```http
GET /api/admin/media
```

**Query Parameters:**
- `folder`: Filter by folder (e.g., "yourhaat/products")
- `next_cursor`: Pagination cursor from previous response
- `q`: Search by public_id

**Response:**
```json
{
  "resources": [
    {
      "public_id": "yourhaat/products/prod123",
      "secure_url": "https://res.cloudinary.com/.../image.webp",
      "format": "webp",
      "width": 1600,
      "height": 1200,
      "bytes": 156000,
      "created_at": "2026-03-28T10:00:00.000Z"
    }
  ],
  "next_cursor": "abc123...",
  "total_count": 500
}
```

---

#### 66. List Folders
```http
GET /api/admin/media/folders
```

**Response:**
```json
{
  "folders": [
    { "name": "yourhaat/products", "path": "yourhaat/products" },
    { "name": "yourhaat/banners", "path": "yourhaat/banners" }
  ]
}
```

---

#### 67. Delete Media
```http
DELETE /api/admin/media
```

**Request Body:**
```json
{
  "public_ids": [
    "yourhaat/products/prod123",
    "yourhaat/banners/banner456"
  ]
}
```

**Response:**
```json
{
  "deleted": {
    "yourhaat/products/prod123": "deleted",
    "yourhaat/banners/banner456": "deleted"
  }
}
```

**Notes:**
- Batch deletion supported
- Max 100 images per request
- Permanently deletes from Cloudinary

---

### Discounts

#### 68. List Discounts
```http
GET /api/admin/discounts
```

**Response:**
```json
{
  "discounts": [
    {
      "_id": "disc123",
      "title": "10% Off",
      "description": "Save on all items",
      "code": "SAVE10",
      "type": "percentage",
      "value": 10,
      "minPurchase": 500,
      "maxDiscount": 200,
      "isActive": true,
      "startDate": "2026-03-01T00:00:00.000Z",
      "endDate": "2026-03-31T23:59:59.000Z",
      "usageLimit": 1000,
      "usedCount": 250,
      "order": 1
    }
  ]
}
```

---

#### 69. Create Discount
```http
POST /api/admin/discounts
```

**Request Body:**
```json
{
  "title": "10% Off",
  "description": "Save on all items",
  "code": "SAVE10",
  "type": "percentage", // or "flat"
  "value": 10,
  "minPurchase": 500,
  "maxDiscount": 200,
  "isActive": true,
  "startDate": "2026-03-01T00:00:00.000Z",
  "endDate": "2026-03-31T23:59:59.000Z",
  "usageLimit": 1000
}
```

---

#### 70. Update Discount
```http
PUT /api/admin/discounts/:id
```

---

#### 71. Delete Discount
```http
DELETE /api/admin/discounts/:id
```

---

#### 72. Reorder Discounts
```http
PUT /api/admin/discounts-reorder
```

---

### Waitlist

#### 73. List Waitlist Entries
```http
GET /api/admin/waitlist
```

**Query Parameters:**
- `productId`: Filter by product
- `notified`: Filter by notification status (true/false)

**Response:**
```json
{
  "entries": [
    {
      "_id": "wait123",
      "productId": "prod123",
      "productTitle": "Product Name",
      "email": "customer@example.com",
      "notified": false,
      "createdAt": "2026-03-20T10:00:00.000Z"
    }
  ],
  "total": 50
}
```

---

#### 74. Mark as Notified
```http
PUT /api/admin/waitlist/:id/notified
```

**Response:**
```json
{
  "message": "Marked as notified"
}
```

---

#### 75. Delete Waitlist Entry
```http
DELETE /api/admin/waitlist/:id
```

---

### Orders (Admin)

#### 76. Dashboard Overview
```http
GET /api/admin/dashboard-overview
```

**Response:**
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
    "yesterday": { /* same structure */ },
    "last7Days": { /* same structure */ },
    "last30Days": { /* same structure */ }
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
  "recentOrders": [
    { /* order object */ }
  ],
  "topSellingProducts": [
    {
      "product": { /* product object */ },
      "totalSold": 500,
      "revenue": 750000
    }
  ],
  "hourlyRevenue": [
    { "hour": "00:00", "revenue": 5000 },
    { "hour": "01:00", "revenue": 3000 },
    ...
  ],
  "stock": {
    "threshold": 10,
    "outOfStockCount": 25,
    "lowStockCount": 50,
    "outOfStock": [ /* products */ ],
    "lowStock": [ /* products */ ]
  },
  "actionCenter": {
    "pendingOrders": 15,
    "processingOrders": 20,
    "unpaidOnlineOrders": 5,
    "lowStockCount": 50
  }
}
```

---

#### 77. List Orders
```http
GET /api/admin/orders
```

**Query Parameters:**
- `page`, `limit`: Pagination
- `status`: Filter by status
- `paymentStatus`: Filter by payment status
- `paymentMethod`: Filter by payment method
- `q`: Search by order ID, email, phone
- `startDate`, `endDate`: Date range filter

---

#### 78. Get Single Order
```http
GET /api/admin/orders/:id
```

---

#### 79. Update Order Status
```http
PUT /api/admin/orders/:id/status
```

**Request Body:**
```json
{
  "status": "confirmed" // created, pending, confirmed, processing, sent-to-courier, delivered, cancelled, failed
}
```

**Notes:**
- Sends email notification to customer
- Updates order timestamp

---

#### 80. Update Payment Status
```http
PUT /api/admin/orders/:id/payment-status
```

**Request Body:**
```json
{
  "paymentStatus": "paid" // pending, paid, failed, refunded
}
```

---

#### 81. Delete Order
```http
DELETE /api/admin/orders/:id
```

**Notes:**
- Permanently deletes order
- Restores inventory if not delivered
- Use with caution

---

## Public Content APIs

These APIs are publicly accessible without authentication.

---

#### 1. Get Active Occasions
```http
GET /api/occasions
```

**Response:**
```json
{
  "occasions": [
    {
      "_id": "occ123",
      "title": "Eid Collection",
      "subtitle": "Special offers",
      "backgroundColor": "#ff6b6b",
      "textColor": "#ffffff",
      "backgroundImage": "https://...",
      "products": [ /* populated product objects */ ]
    }
  ]
}
```

---

#### 2. Get Featured Sections
```http
GET /api/featured
```

**Response:**
```json
{
  "featured": [
    {
      "_id": "feat123",
      "title": "Best Sellers",
      "products": [ /* populated products */ ]
    }
  ]
}
```

---

#### 3. Get Promo Strip Items
```http
GET /api/promo-strip
```

**Response:**
```json
{
  "items": [
    {
      "_id": "promo123",
      "text": "Free Shipping",
      "icon": "📦"
    }
  ]
}
```

---

#### 4. Get Promo Panels
```http
GET /api/promo-panels
```

---

#### 5. Get Active Banners
```http
GET /api/banners
```

---

#### 6. Get Active Popup
```http
GET /api/popup
```

---

#### 7. Get Active Discounts
```http
GET /api/discounts
```

---

#### 8. Join Waitlist
```http
POST /api/waitlist
```

**Request Body:**
```json
{
  "productId": "prod123",
  "email": "customer@example.com"
}
```

**Response:**
```json
{
  "message": "Added to waitlist successfully",
  "entry": {
    "_id": "wait123",
    "productId": "prod123",
    "email": "customer@example.com",
    "notified": false
  }
}
```

**Validation:**
- Email must be valid
- Product must exist
- Prevents duplicate entries

---

## Error Handling

### Standard Error Response Format
```json
{
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST |
| 400 | Bad Request | Missing/invalid parameters, validation errors |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Insufficient permissions, admin secret mismatch |
| 404 | Not Found | Resource doesn't exist |
| 423 | Locked | Account locked (too many failed login attempts) |
| 500 | Internal Server Error | Unexpected server error |
| 502 | Bad Gateway | Payment gateway error |
| 503 | Service Unavailable | Database connection error |

### Common Error Examples

#### Validation Error
```json
{
  "error": "Price must be a positive number"
}
```

#### Authentication Error
```json
{
  "error": "Authentication required. Please log in."
}
```

#### Permission Error
```json
{
  "error": "Insufficient permissions. Admin access required."
}
```

#### Not Found Error
```json
{
  "error": "Product not found"
}
```

#### Inventory Error
```json
{
  "error": "Insufficient stock. Only 5 items available."
}
```

---

## Environment Setup

### Required Environment Variables

```bash
# Server
PORT=5000
NODE_ENV=production

# Database
MONGODB_URI=mongodb://localhost:27017/yourhaat

# JWT Secret
JWT_SECRET=your_super_secret_key_here

# Admin Secret (for admin registration/login)
ADMIN_SECRET=your_admin_secret_key

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_FOLDER=yourhaat/products

# Image Optimization
IMG_MAX_WIDTH=1600
IMG_QUALITY=75

# CORS
FRONTEND_ORIGIN=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com

# SSLCommerz (Payment Gateway)
STORE_ID=your_store_id
STORE_PASSWORD=your_store_password
IS_LIVE=false # true for production

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

---

## Rate Limiting

Currently, there is **no rate limiting** implemented. Consider adding rate limiting middleware for production:

- Login endpoints: 5 requests per 15 minutes
- API endpoints: 100 requests per 15 minutes
- File uploads: 10 requests per hour

---

## CORS Configuration

The API uses dynamic CORS with credential support:

```javascript
cors({
  origin: (origin, callback) => callback(null, origin),
  credentials: true
})
```

This allows **all origins** but validates credentials. For production, restrict to specific domains.

---

## File Upload Limits

- **Max file size:** 10MB
- **Allowed formats:** JPEG, PNG, WebP, AVIF
- **Output format:** WebP (optimized)
- **Max dimensions:** 1600px width (auto height)
- **Quality:** 75% (WebP)

---

## Pagination Defaults

- **Default page:** 1
- **Default limit:** 20
- **Max limit:** 100 (products), 200 (users), 50 (blog)

---

## Date Formats

All dates use **ISO 8601** format:
```
2026-03-28T10:00:00.000Z
```

---


## Testing

### Test Admin Account
```
Email: admin@yourhaat.com
Password: admin123
Secret: [ADMIN_SECRET from .env]
```

### Test Payment (SSLCommerz Sandbox)
```
Card Number: 4532015112830366
Expiry: 12/30
CVV: 123
```

---

## Support & Contact

For API issues or questions:
- **Email:** support@yourhaat.com
- **GitHub Issues:** [Project Repository]
- **Documentation:** This file

---

**Last Updated:** March 28, 2026
**API Version:** 1.0.0
**Maintained by:** yourHaat Team
