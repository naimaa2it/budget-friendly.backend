import mongoose from 'mongoose';

const BrandSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
  logo: { type: String, default: null },
  coverImage: { type: String, default: null },
  description: { type: String, default: '' },
  // 'electronics' | 'skincare' | 'fashion' | 'general'
  type: { type: String, enum: ['electronics', 'skincare', 'fashion', 'general'], default: 'general' },
  countryOfOrigin: { type: String, default: '' },
  website: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  seo: {
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

BrandSchema.pre('save', function () { this.updatedAt = new Date(); });

BrandSchema.index({ slug: 1 }, { unique: true });
BrandSchema.index({ isActive: 1, order: 1 });
BrandSchema.index({ type: 1, isActive: 1 });
BrandSchema.index({ isFeatured: 1, isActive: 1 });

export default mongoose.models.Brand || mongoose.model('Brand', BrandSchema);
