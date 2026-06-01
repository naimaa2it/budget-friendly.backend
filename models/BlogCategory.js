import mongoose from 'mongoose';

const BlogCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, unique: true, index: true },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

BlogCategorySchema.pre('save', function() {
  if (!this.slug && this.name) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  this.updatedAt = Date.now();
});

BlogCategorySchema.pre('findOneAndUpdate', function() {
  this.set({ updatedAt: Date.now() });
});

export default mongoose.models.BlogCategory || mongoose.model('BlogCategory', BlogCategorySchema);
