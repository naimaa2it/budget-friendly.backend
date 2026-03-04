import mongoose from 'mongoose';

const FeaturedSectionSchema = new mongoose.Schema({
  title:       { type: String, required: true },   // e.g. "Eid Fest on Smart Televisions!"
  viewAllLink: { type: String, default: '/' },
  isActive:    { type: Boolean, default: true },
  order:       { type: Number, default: 0 },
  // Admin manually picks products to display
  productIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  // Optional: auto-pull from a category instead (if productIds is empty)
  categoryId:  { type: String, default: '' },
  limit:       { type: Number, default: 10 },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});

FeaturedSectionSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

export default mongoose.models.FeaturedSection ||
  mongoose.model('FeaturedSection', FeaturedSectionSchema);
