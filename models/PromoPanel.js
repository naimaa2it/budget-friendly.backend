import mongoose from 'mongoose';

const PromoPanelSchema = new mongoose.Schema({
  image:      { url: { type: String, default: '' }, public_id: { type: String, default: '' } },
  subtitle:   { type: String, default: '' },   // small text above heading, e.g. "Car Wheel"
  title:      { type: String, default: '' },   // main heading, e.g. "Buy the Grills"
  buttonText: { type: String, default: 'View All' },
  buttonLink: { type: String, default: '/' },
  isActive:   { type: Boolean, default: true },
  order:      { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
});

PromoPanelSchema.pre('save', function () { this.updatedAt = Date.now(); });

export default mongoose.models.PromoPanel || mongoose.model('PromoPanel', PromoPanelSchema);
