import mongoose from 'mongoose';

const PromoPanelSchema = new mongoose.Schema({
  image:      { url: { type: String, default: '' }, public_id: { type: String, default: '' } },
  subtitle:   { type: String, default: '' },
  title:      { type: String, default: '' },
  buttonText: { type: String, default: 'View All' },
  buttonLink: { type: String, default: '/' },
  isActive:   { type: Boolean, default: true },
  order:      { type: Number, default: 0 },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
});

PromoPanelSchema.pre('save', function () { this.updatedAt = Date.now(); });

export default mongoose.models.PromoPanel || mongoose.model('PromoPanel', PromoPanelSchema);
