import mongoose from 'mongoose';

const DiscountSchema = new mongoose.Schema({
  // Display fields (for homepage/promo cards)
  title:              { type: String, default: '' },
  subtitle:           { type: String, default: '' },
  spend:              { type: String, default: '' },       // e.g. "999 TK" (display text)
  highlight:          { type: String, default: '' },       // e.g. "Free" or "৳150"
  highlightSecondary: { type: String, default: '' },       // optional 2nd line (for 2-line highlights)
  description:        { type: String, default: '' },
  couponCode:         { type: String, default: '' },       // optional coupon code e.g. "SAVE150"
  theme:              { type: String, default: 'pink' },   // color theme key
  isActive:           { type: Boolean, default: true },
  order:              { type: Number, default: 0 },

  // Functional coupon fields (for actual discount logic)
  discountType:       { type: String, enum: ['fixed', 'percentage', 'free_shipping'], default: 'fixed' },
  discountValue:      { type: Number, default: 0 },        // amount for fixed, percent for percentage, ignored for free_shipping
  minOrderAmount:     { type: Number, default: 0 },        // minimum cart subtotal required
  maxDiscountAmount:  { type: Number, default: 0 },        // cap for percentage discounts (0 = no cap)
  isFirstOrderOnly:   { type: Boolean, default: false },   // only for users with no prior orders
  isNewUserOnly:      { type: Boolean, default: false },   // only for users registered < 30 days
  maxUsesTotal:       { type: Number, default: 0 },        // 0 = unlimited
  maxUsesPerUser:     { type: Number, default: 0 },        // 0 = unlimited
  usageCount:         { type: Number, default: 0 },        // total times this coupon has been used
  stackable:          { type: Boolean, default: false },   // can be combined with other coupons
  expiresAt:          { type: Date, default: null },       // null = never expires
  
  createdAt:          { type: Date, default: Date.now },
  updatedAt:          { type: Date, default: Date.now },
});

// Indexes for efficient coupon lookup and eligibility checks
DiscountSchema.index({ couponCode: 1 }, { unique: true, sparse: true });
DiscountSchema.index({ isActive: 1, expiresAt: 1 });

DiscountSchema.pre('save', function () { this.updatedAt = Date.now(); });

export default mongoose.models.Discount || mongoose.model('Discount', DiscountSchema);
