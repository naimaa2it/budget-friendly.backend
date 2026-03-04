import mongoose from 'mongoose';

const BannerSchema = new mongoose.Schema({
  image:      { url: { type: String, default: '' }, public_id: { type: String, default: '' } },
  title:      { type: String, default: '' },
  subtitle:   { type: String, default: '' },
  buttonText: { type: String, default: 'Order Now' },
  buttonLink: { type: String, default: '/' },
  badge:      { type: String, default: '' },   // e.g. "FREE DELIVERY", "SAVE UP TO 20%"
  isActive:   { type: Boolean, default: true },
  order:      { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
});

BannerSchema.pre('save', function () { this.updatedAt = Date.now(); });

export default mongoose.models.Banner || mongoose.model('Banner', BannerSchema);
