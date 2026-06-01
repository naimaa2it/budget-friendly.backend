import mongoose from 'mongoose';

const WaitlistSchema = new mongoose.Schema({
  productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productTitle: { type: String },
  email:        { type: String },
  phone:        { type: String },
  notified:     { type: Boolean, default: false },
  createdAt:    { type: Date, default: Date.now }
});

export default mongoose.models?.Waitlist || mongoose.model('Waitlist', WaitlistSchema);
