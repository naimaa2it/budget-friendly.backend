import mongoose from 'mongoose';

const PromoStripItemSchema = new mongoose.Schema({
  title:      { type: String, required: true, trim: true },
  highlightWord:  { type: String, default: '', trim: true },
  highlightColor: { type: String, default: '', trim: true },
  subtitle:   { type: String, default: '', trim: true },
  link:       { type: String, default: '/', trim: true },
  image: {
    public_id: { type: String, default: '' },
    url:       { type: String, default: '' },
    width:     { type: Number },
    height:    { type: Number },
    format:    { type: String, default: '' },
  },
  isActive:   { type: Boolean, default: true },
  order:      { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
});

PromoStripItemSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

export default mongoose.models.PromoStripItem ||
  mongoose.model('PromoStripItem', PromoStripItemSchema);
