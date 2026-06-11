import mongoose from 'mongoose';

const ReviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  userName: { type: String, required: true },
  userEmail: { type: String, default: null },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  images: { type: [String], default: [] },
  isVerifiedPurchase: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: true },
  helpfulVotes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ReviewSchema.pre('save', function () { this.updatedAt = new Date(); });

ReviewSchema.index({ productId: 1, createdAt: -1 });
ReviewSchema.index({ productId: 1, isApproved: 1 });
ReviewSchema.index({ userId: 1, productId: 1 });

export default mongoose.models.Review || mongoose.model('Review', ReviewSchema);
