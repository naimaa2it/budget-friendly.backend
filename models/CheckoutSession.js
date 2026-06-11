import mongoose from 'mongoose';

const CheckoutSessionSchema = new mongoose.Schema({
  userId: { type: String, default: null },
  userEmail: { type: String, default: null },
  userName: { type: String, default: null },
  userPhone: { type: String, default: null },
  items: [{
    productId: { type: String, default: '' },
    title: { type: String, default: '' },
    image: { type: String, default: null },
    price: { type: Number, default: 0 },
    quantity: { type: Number, default: 1 },
  }],
  total: { type: Number, default: 0 },
  status: { type: String, enum: ['incomplete', 'completed'], default: 'incomplete' },
  completedAt: { type: Date, default: null },
  abandonedEmailSent: { type: Boolean, default: false },
  abandonedEmailSentAt: { type: Date, default: null },
}, { timestamps: true });

CheckoutSessionSchema.index({ status: 1, updatedAt: 1, abandonedEmailSent: 1 });

export default mongoose.models.CheckoutSession ||
  mongoose.model('CheckoutSession', CheckoutSessionSchema);
