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
  category: { type: String, default: 'general' },
  tags: [{ type: String }],
  // category-specific structured fields (brand, specs, material, sizes, etc.)
  specs: { type: Object },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  images: [ImageSchema],
  variants: [VariantSchema],
  // convenience fields for single-variant products
  price: { type: Number },
  compareAtPrice: { type: Number },
  inventory: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  seo: {
    title: { type: String },
    description: { type: String }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ProductSchema.pre('save', function () {
  this.updatedAt = Date.now();
  if (!this.slug && this.title) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
});

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
