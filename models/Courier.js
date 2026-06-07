import mongoose from 'mongoose';

const CourierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    trackingUrlTemplate: {
      type: String,
      default: '',
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    apiEnabled: {
      type: Boolean,
      default: false,
    },
    credentialsEncrypted: {
      type: String,
      default: '',
    },
    storeConfig: {
      pathaoStoreId: { type: Number, default: null },
      defaultWeight: { type: Number, default: 0.5 },
      defaultItemType: { type: Number, default: 2 },
      deliveryType: { type: Number, default: 48 },
      pickupStoreId: { type: Number, default: null },
      redxDeliveryAreaId: { type: Number, default: null },
      redxDeliveryAreaName: { type: String, default: '' },
      redxBaseUrl: {
        type: String,
        default: 'https://openapi.redx.com.bd/v1.0.0-beta',
      },
      steadfastBaseUrl: {
        type: String,
        default: 'https://portal.packzy.com/api/v1',
      },
    },
    capabilities: {
      fraudCheck: { type: Boolean, default: true },
      trackingSync: { type: Boolean, default: true },
      parcelCreate: { type: Boolean, default: true },
    },
    integrationStatus: {
      lastTestedAt: { type: Date, default: null },
      lastTestOk: { type: Boolean, default: false },
      lastTestMessage: { type: String, default: '' },
    },
  },
  { timestamps: true },
);

export default mongoose.models.Courier || mongoose.model('Courier', CourierSchema);
