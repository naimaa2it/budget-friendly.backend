import mongoose from 'mongoose';

const VariantSchema = new mongoose.Schema({
  title: { type: String },
  sku: { type: String },
  price: { type: Number, required: true },
  compareAtPrice: { type: Number },
  inventory: { type: Number, default: 0 },
  attributes: { type: Object }, // e.g. { color: 'Black', size: 'M' }
});

const ImageSchema = new mongoose.Schema({
  public_id: { type: String },
  url: { type: String },
  alt: { type: String },
  width: { type: Number },
  height: { type: Number },
  format: { type: String }
});

const ProductSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, index: true },
  description: { type: String },
  sku: { type: String, index: true }, // top-level SKU for single-variant products
  category: { type: String, default: 'general' },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  tags: [{ type: String }],
  // admin-visible badges (e.g. best_seller, hot, new_arrival)
  badges: [{ type: String, enum: ['best_seller','hot','new_arrival','trending','limited'] , default: [] }],
  // category-specific structured fields (brand, specs, material, sizes, etc.)
  specs: { type: Object },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },

  // images & variants
  images: [ImageSchema],
  variants: [VariantSchema],

  // pricing & inventory
  price: { type: Number },
  compareAtPrice: { type: Number },
  currency: { type: String, default: 'USD' },
  inventory: { type: Number, default: 0 },
  availability: { type: String, enum: ['in_stock', 'pre_order', 'upcoming', 'out_of_stock'], default: 'in_stock' },

  // product-specific attributes
  colors: [{ name: { type: String }, hex: { type: String } }],
  sizes: [{ type: String }],
  guidelines: { type: String },
  featured: { type: Boolean, default: false },

  // promotion flags (admin toggles)
  coupon: { type: Boolean, default: false }, // eligible for coupons
  flashSale: { type: Boolean, default: false },
  clearance: { type: Boolean, default: false },

  // sales / rewards / attributes
  monthlySold: { type: Number, default: 0 }, // bought in past month
  rewardPoints: { type: Number, default: 0 },
  keyAttributes: [{ label: String, value: String }],
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
      new mongoose.Schema({
        name: String,
        type: String,    // e.g. "text", "select", etc.
        values: [String]
      }, { _id: false })
    ]
  },

  // warranty & return policy
  warranty: {
    period: { type: String },
    details: { type: String },
    provider: { type: String }
  },
  returnPolicy: {
    days: { type: Number },
    refundable: { type: Boolean, default: true },
    details: { type: String }
  },

  // reviews & rating
  reviews: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String }, // optional display name when not linked to a user
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String },
    body: { type: String },
    helpful: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
  }],
  averageRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },

  // FAQ
  faqs: [{ question: String, answer: String }],

  // seo + timestamps
  seo: {
    title: { type: String },
    description: { type: String }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// human-friendly monthly-sold label (virtual)
ProductSchema.virtual('monthlySoldLabel').get(function () {
  const n = this.monthlySold || 0;
  if (n >= 1000000) return Math.round((n / 1000000) * 10) / 10 + 'M+';
  if (n >= 1000) return Math.round((n / 1000) * 10) / 10 + 'k+';
  return String(n);
});

ProductSchema.pre('save', function () {
  // update timestamps and slug
  this.updatedAt = Date.now();
  if (!this.slug && this.title) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
