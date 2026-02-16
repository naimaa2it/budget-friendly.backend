import mongoose from 'mongoose';

const ImageSchema = new mongoose.Schema({
  public_id: { type: String },
  url: { type: String },
  alt: { type: String },
  width: { type: Number },
  height: { type: Number },
  format: { type: String }
});

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, index: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  level: { type: Number, default: 0 },
  order: { type: Number, default: 0 },
  images: [ImageSchema],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});


CategorySchema.pre('save', function() {
  if (!this.slug && this.name) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
});

export default mongoose.models.Category || mongoose.model('Category', CategorySchema);
