import mongoose from 'mongoose';

const PopupSchema = new mongoose.Schema({
  image:    { url: { type: String, default: '' }, public_id: { type: String, default: '' } },
  link:     { type: String, default: '/' },
  isActive: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
});

PopupSchema.pre('save', function () { this.updatedAt = Date.now(); });

export default mongoose.models.Popup || mongoose.model('Popup', PopupSchema);
