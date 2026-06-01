import mongoose from 'mongoose';

const CouponUsageSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  couponId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Discount', required: true },
  orderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  usedAt:     { type: Date, default: Date.now },
});

// Compound index for efficient lookup of user's coupon usage
CouponUsageSchema.index({ userId: 1, couponId: 1 });
CouponUsageSchema.index({ couponId: 1 });

export default mongoose.models.CouponUsage || mongoose.model('CouponUsage', CouponUsageSchema);
