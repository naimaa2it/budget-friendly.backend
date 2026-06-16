import mongoose from "mongoose";

const VariantSchema = new mongoose.Schema({
  name: { type: String }, // e.g., "Red - Large" or "16 inch"
  color: {
    name: { type: String }, // e.g., "Red"
    hex: { type: String }, // e.g., "#FF000
  },
  size: { type: String }, // e.g., "L" or "16 inch"
  sku: { type: String },
  buyingPrice: { type: Number },
  price: { type: Number, required: true },
  compareAtPrice: { type: Number },
  inventory: { type: Number, default: 0 },
  // Keep attributes for backward compatibility and custom attributes
  attributes: { type: Object },
});

const ImageSchema = new mongoose.Schema({
  public_id: { type: String },
  url: { type: String },
  alt: { type: String },
  width: { type: Number },
  height: { type: Number },
  format: { type: String },
});

const IngredientSchema = new mongoose.Schema(
  {
    name: { type: String }, // common name
    inciName: { type: String }, // INCI name for cosmetics
    percentage: { type: Number }, // optional (e.g., 5 for 5%)
    function: { type: String }, // e.g., 'humectant', 'exfoliant'
  },
  { _id: false },
);

const ProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, index: true },
    description: { type: String },
    detailedDescription: { type: mongoose.Schema.Types.Mixed }, // block array [{type,content/url/images}] for product details page
    sku: { type: String, index: true }, // top-level SKU for single-variant products
    barcode: { type: String, index: true, sparse: true },
    category: { type: String, default: "general" },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    department: { type: String }, // Brand/department (e.g., ryans, asus, cosrx)
    productType: { type: String, enum: ['general', 'skincare', 'electronics'], default: 'general' },
    tags: [{ type: String }],
    // admin-visible badges (e.g. best_seller, hot, new_arrival)
    badges: [{ type: String, trim: true, lowercase: true, default: [] }],
    // category-specific structured fields (brand, specs, material, sizes, etc.)
    specs: { type: Object },
    // skincare-specific fields
    ingredients: [IngredientSchema],
    activeIngredients: [
      { name: String, concentration: String, benefit: String },
    ],
    skinTypes: [
      {
        type: String,
        enum: ["normal", "dry", "oily", "combination", "sensitive"],
      },
    ],
    suitableConcerns: [{ type: String }],
    formulation: { type: String }, // serum, cream, gel, oil, cleanser, toner, mask, mist
    volume: { value: { type: Number }, unit: { type: String, default: "ml" } },
    pH: { type: Number },
    spf: { type: Number },
    broadSpectrum: { type: Boolean, default: false },
    dermatologistTested: { type: Boolean, default: false },
    comedogenicRating: { type: Number, min: 0, max: 5 },
    allergens: [{ type: String }],
    fragranceFree: { type: Boolean, default: false },
    parabenFree: { type: Boolean, default: false },
    sulfateFree: { type: Boolean, default: false },
    crueltyFree: { type: Boolean, default: false },
    vegan: { type: Boolean, default: false },
    directions: { type: String },
    precautions: { type: String },
    shelfLifeMonths: { type: Number },
    manufactureDate: { type: Date },
    expiryDate: { type: Date },
    batchNumber: { type: String },
    certifications: [{ type: String }],
    highlightIngredients: [{ type: String }],
    recommendedRoutineStep: [{ type: String }],
    safetyNotes: { type: String },
    testResults: {
      irritationRate: { type: Number },
      userCount: { type: Number },
      summary: { type: String },
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
    },

    // images & variants
    images: [ImageSchema],
    variants: [VariantSchema],

    // pricing & inventory
    buyingPrice: { type: Number },
    price: { type: Number },
    compareAtPrice: { type: Number },
    inventory: { type: Number, default: 0 },
    availability: {
      type: String,
      enum: ["in_stock", "pre_order", "upcoming", "out_of_stock"],
      default: "in_stock",
    },
    allowOverselling: { type: Boolean, default: false },
    lowStockThreshold: { type: Number, default: 5 },
    trackInventory: { type: Boolean, default: true },

    // DEPRECATED: colors and sizes are now stored in variants
    // These fields are kept for backward compatibility but should not be used for new products
    // colors: [{ name: { type: String }, hex: { type: String } }],
    // sizes: [{ type: String }],

    guidelines: { type: String }, // Rich HTML (care & handling instructions)
    specifications: [
      new mongoose.Schema(
        {
          type:  { type: String, default: "row" }, // "row" | "header"
          label: { type: String },                 // used when type === "header"
          key:   { type: String },                 // used when type === "row"
          value: { type: String },                 // used when type === "row"
        },
        { _id: false },
      ),
    ],
    featured: { type: Boolean, default: false },

    // ownership + audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },

    // promotion flags (admin toggles)
    coupon: { type: Boolean, default: false }, // eligible for coupons
    flashSale: { type: Boolean, default: false },
    flashSalePrice: { type: Number, default: null },
    flashSaleStartsAt: { type: Date, default: null },
    flashSaleEndsAt: { type: Date, default: null },
    clearance: { type: Boolean, default: false },
    freeShipping: { type: Boolean, default: false },

    // sales / rewards / attributes
    monthlySold: { type: Number, default: 0 }, // bought in past month
    viewCount: { type: Number, default: 0 },   // product page views
    rewardPoints: { type: Number, default: 0 },
    keyAttributes: [
      {
        level: String,
        attributes: [{ key: String, value: String }],
      },
    ], // e.g., { level: 'Connectivity', attributes: [{ key: 'Bluetooth', value: 'V5.3' }] }
    // customisation options that customers can pick
    customization: {
      customizable: { type: Boolean, default: false },
      // `type` is a valid field name, but Mongoose treats it specially when
      // we use the shorthand object notation inside an array.  The original
      // inline definition caused the schema to be interpreted as
      // `options: [String]`, which in turn led to the "Cast to [string] failed"
      // error when we tried to save an object.  To avoid the ambiguity we
      // explicitly build a sub‑schema below.
      options: [
        new mongoose.Schema(
          {
            name: String,
            type: String, // e.g. "text", "select", etc.
            values: [String],
          },
          { _id: false },
        ),
      ],
    },

    // warranty & return policy
    warranty: {
      period: { type: String },
      details: { type: String },
      provider: { type: String },
    },
    returnPolicy: {
      days: { type: Number },
      refundable: { type: Boolean, default: true },
      details: { type: String },
    },

    // reviews & rating
    reviews: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        authorName: { type: String }, // optional display name when not linked to a user
        rating: { type: Number, min: 1, max: 5, required: true },
        title: { type: String },
        body: { type: String },
        images: { type: [String], default: [] },
        helpful: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },

    // FAQ / Community Q&A
    faqs: [
      {
        question: { type: String, required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        askerName: { type: String },
        createdAt: { type: Date, default: Date.now },
        // community + seller answers
        answers: [
          {
            user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            authorName: { type: String },
            body: { type: String },
            isOfficial: { type: Boolean, default: false }, // true = seller/admin answer
            helpful: { type: Number, default: 0 },
            helpfulBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
            createdAt: { type: Date, default: Date.now },
          },
        ],
      },
    ],

    // frequently bought together (up to 6 product references)
    frequentlyBoughtTogether: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    ],

    // seo + timestamps
    seo: {
      title: { type: String },
      description: { type: String },
      keywords: [{ type: String }], // comma-separated keywords for SEO
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// human-friendly monthly-sold label (virtual)
ProductSchema.virtual("monthlySoldLabel").get(function () {
  const n = this.monthlySold || 0;
  if (n >= 1000000) return Math.round((n / 1000000) * 10) / 10 + "M+";
  if (n >= 1000) return Math.round((n / 1000) * 10) / 10 + "k+";
  return String(n);
});

ProductSchema.pre("save", function () {
  // update timestamps and slug
  this.updatedAt = Date.now();
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // recalculate aggregated review fields
  if (Array.isArray(this.reviews) && this.reviews.length) {
    const sum = this.reviews.reduce((s, r) => s + (r.rating || 0), 0);
    this.reviewCount = this.reviews.length;
    this.averageRating = Math.round((sum / this.reviewCount) * 10) / 10; // one decimal
  } else {
    this.reviewCount = 0;
    this.averageRating = 0;
  }
});

// Virtual: true only when flashSale flag is set AND within the scheduled window
ProductSchema.virtual('isFlashSaleActive').get(function () {
  if (!this.flashSale) return false;
  const now = new Date();
  if (this.flashSaleStartsAt && now < this.flashSaleStartsAt) return false;
  if (this.flashSaleEndsAt && now > this.flashSaleEndsAt) return false;
  return true;
});

ProductSchema.index({ flashSale: 1, flashSaleEndsAt: 1 });
ProductSchema.index({ title: "text", slug: "text", description: "text", "ingredients.inciName": "text" });
ProductSchema.index({ categoryId: 1, price: 1 });
ProductSchema.index({ featured: 1, monthlySold: -1 });
ProductSchema.index({ spf: 1 }, { sparse: true });
ProductSchema.index({ status: 1, categoryId: 1, createdAt: -1 });
ProductSchema.index({ status: 1, averageRating: -1 });
ProductSchema.index({ status: 1, monthlySold: -1 });

export default mongoose.models.Product ||
  mongoose.model("Product", ProductSchema);
