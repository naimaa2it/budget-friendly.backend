import mongoose from 'mongoose';

const FAQSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  askedBy: { type: String, default: 'Anonymous' },
  answeredBy: { type: String, default: 'YourHaat Team' },
  isPublished: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

FAQSchema.pre('save', function () { this.updatedAt = new Date(); });

FAQSchema.index({ productId: 1, order: 1 });

export default mongoose.models.FAQ || mongoose.model('FAQ', FAQSchema);
