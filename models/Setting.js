import mongoose from 'mongoose';

const PaymentProvidersSchema = new mongoose.Schema({
  stripe: {
    enabled: { type: Boolean, default: false },
    publicKey: { type: String }
  },
  razorpay: {
    enabled: { type: Boolean, default: false },
    keyId: { type: String }
  }
}, { _id: false });

const SettingsSchema = new mongoose.Schema({
  storeName: { type: String, default: 'YourHaat' },
  storeEmail: { type: String, default: '' },
  currency: { type: String, default: 'INR' },
  taxPercent: { type: Number, default: 0 },
  lowStockThreshold: { type: Number, default: 5 },
  defaultShipping: { type: Number, default: 0 },
  paymentProviders: { type: PaymentProvidersSchema, default: () => ({}) },
  cloudinaryFolder: { type: String, default: 'yourhaat/products' },
  updatedAt: { type: Date, default: Date.now }
});

SettingsSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

export default mongoose.models.Setting || mongoose.model('Setting', SettingsSchema);
