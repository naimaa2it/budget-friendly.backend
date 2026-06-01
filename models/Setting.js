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
  storeName: { type: String, default: 'Budget Friendly' },
  storeEmail: { type: String, default: '' },
  taxPercent: { type: Number, default: 0 },
  lowStockThreshold: { type: Number, default: 5 },
  defaultShipping: { type: Number, default: 0 },
  paymentProviders: { type: PaymentProvidersSchema, default: () => ({}) },
  cloudinaryFolder: { type: String, default: 'yourhaat/products' },
  topBannerEnabled: { type: Boolean, default: false },
  topBannerHtml: { type: String, default: '' },
  topBannerConfig: {
    imageUrl: { type: String, default: '' },
    linkUrl: { type: String, default: '' },
    bgColor: { type: String, default: '' },
    text: { type: String, default: '' },
    height: { type: String, default: '' }
  },
  adsenseEnabled: { type: Boolean, default: false },
  adsensePublisherId: { type: String, default: '' },
  adsenseSlot: { type: String, default: '' },
  websiteLogo: {
    public_id: { type: String, default: '' },
    url: { type: String, default: '' },
    width: { type: Number },
    height: { type: Number },
    format: { type: String, default: '' }
  },
  megaMenuTags: [{
    name: { type: String, trim: true },
    href: { type: String, trim: true },
    icon: { type: String, trim: true },
    color: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  }],
  productBadgeOptions: [{
    key: { type: String, trim: true, lowercase: true },
    label: { type: String, trim: true },
    color: { type: String, trim: true }
  }],
  updatedAt: { type: Date, default: Date.now }
});

SettingsSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

export default mongoose.models.Setting || mongoose.model('Setting', SettingsSchema);
