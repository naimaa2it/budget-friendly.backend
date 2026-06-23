import mongoose from "mongoose";

const PaymentProvidersSchema = new mongoose.Schema(
  {
    stripe: {
      enabled: { type: Boolean, default: false },
      publicKey: { type: String },
    },
    razorpay: {
      enabled: { type: Boolean, default: false },
      keyId: { type: String },
    },
  },
  { _id: false },
);

const SocialLinkSchema = new mongoose.Schema(
  {
    url:     { type: String, default: '' },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const PolicyItemSchema = new mongoose.Schema(
  {
    question: { type: String, default: '' },
    answer:   { type: String, default: '' },
  },
  { _id: false },
);

const PolicySectionSchema = new mongoose.Schema(
  {
    heading: { type: String, default: '' },
    content: { type: String, default: '' },
  },
  { _id: false },
);

const SettingsSchema = new mongoose.Schema({
  storeName: { type: String, default: "SmartBuy BD" },
  storeEmail: { type: String, default: "" },
  footerInfo: {
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
  },
  contactInfo: {
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
  },
  socialLinks: {
    facebook:  { type: SocialLinkSchema, default: () => ({}) },
    instagram: { type: SocialLinkSchema, default: () => ({}) },
    twitter:   { type: SocialLinkSchema, default: () => ({}) },
    tiktok:    { type: SocialLinkSchema, default: () => ({}) },
    youtube:   { type: SocialLinkSchema, default: () => ({}) },
  },
  taxPercent: { type: Number, default: 0 },
  lowStockThreshold: { type: Number, default: 5 },
  defaultShipping: { type: Number, default: 0 },
  paymentProviders: { type: PaymentProvidersSchema, default: () => ({}) },
  cloudinaryFolder: { type: String, default: "SmartBuyBD/products" },
  topBannerEnabled: { type: Boolean, default: false },
  topBannerHtml: { type: String, default: "" },
  topBannerConfig: {
    imageUrl: { type: String, default: "" },
    linkUrl: { type: String, default: "" },
    bgColor: { type: String, default: "" },
    text: { type: String, default: "" },
    height: { type: String, default: "" },
  },
  adsenseEnabled: { type: Boolean, default: false },
  adsensePublisherId: { type: String, default: "" },
  adsenseSlot: { type: String, default: "" },
  websiteLogo: {
    public_id: { type: String, default: "" },
    url: { type: String, default: "" },
    width: { type: Number },
    height: { type: Number },
    format: { type: String, default: "" },
  },
  megaMenuTags: [
    {
      name: { type: String, trim: true },
      href: { type: String, trim: true },
      icon: { type: String, trim: true },
      color: { type: String, trim: true },
      isActive: { type: Boolean, default: true },
      order: { type: Number, default: 0 },
    },
  ],
  productBadgeOptions: [
    {
      key: { type: String, trim: true, lowercase: true },
      label: { type: String, trim: true },
      color: { type: String, trim: true },
    },
  ],
  shipmentConfig: {
    pickupAddress: { type: String, default: "" },
    defaultCourierSlug: { type: String, default: "pathao" },
    bookSetsStatus: { type: String, default: "shipped" },
  },
  mobileBanking: {
    bkash: {
      enabled: { type: Boolean, default: false },
      merchantNumber: { type: String, default: "" },
      appKey: { type: String, default: "" },
      appSecret: { type: String, default: "" },
      username: { type: String, default: "" },
      password: { type: String, default: "" },
      mode: { type: String, enum: ["sandbox", "live"], default: "sandbox" },
    },
    nagad: {
      enabled: { type: Boolean, default: false },
      merchantNumber: { type: String, default: "" },
      merchantId: { type: String, default: "" },
      merchantKey: { type: String, default: "" },
      mode: { type: String, enum: ["sandbox", "live"], default: "sandbox" },
    },
    rocket: {
      enabled: { type: Boolean, default: false },
      merchantNumber: { type: String, default: "" },
      apiKey: { type: String, default: "" },
      mode: { type: String, enum: ["sandbox", "live"], default: "sandbox" },
    },
  },
  facebookPixel: {
    pixelId: { type: String, default: "" },
    accessToken: { type: String, default: "" },
    testEventCode: { type: String, default: "" },
    browserSideTracking: { type: Boolean, default: true },
    serverSideTracking: { type: Boolean, default: false },
    active: { type: Boolean, default: false },
    installed: { type: Boolean, default: false },
  },
  googleTagManager: {
    containerId: { type: String, default: "" },
    active: { type: Boolean, default: false },
    installed: { type: Boolean, default: false },
  },
  googleAnalytics4: {
    measurementId: { type: String, default: "" },
    active: { type: Boolean, default: false },
    installed: { type: Boolean, default: false },
  },
  fakeOrderProtection: {
    phoneOrder: {
      enabled: { type: Boolean, default: true },
      limitDuration: { type: Number, default: 5 },
      limitDurationUnit: { type: String, default: "minutes" },
      blocklist: { type: String, default: "" },
    },
    ipOrder: {
      enabled: { type: Boolean, default: true },
      limitDuration: { type: Number, default: 5 },
      limitDurationUnit: { type: String, default: "minutes" },
      blocklist: { type: String, default: "" },
    },
    deviceOrder: {
      enabled: { type: Boolean, default: true },
      limitDuration: { type: Number, default: 5 },
      limitDurationUnit: { type: String, default: "minutes" },
    },
    active: { type: Boolean, default: false },
    installed: { type: Boolean, default: false },
  },
  tiktokPixel: {
    pixelId: { type: String, default: "" },
    accessToken: { type: String, default: "" },
    testEventCode: { type: String, default: "" },
    active: { type: Boolean, default: false },
    installed: { type: Boolean, default: false },
  },
  googleAdsense: {
    publisherId: { type: String, default: "" },
    adSlotId: { type: String, default: "" },
    autoAds: { type: Boolean, default: false },
    active: { type: Boolean, default: false },
    installed: { type: Boolean, default: false },
    pageSettings: {
      homepage: { type: Boolean, default: true },
      productPage: { type: Boolean, default: true },
      categoryPage: { type: Boolean, default: true },
      blogPage: { type: Boolean, default: true },
    },
  },
  policyContent: {
    shipping: { type: [PolicyItemSchema],   default: [] },
    return:   { type: [PolicyItemSchema],   default: [] },
    faq:      { type: [PolicyItemSchema],   default: [] },
    privacy:  { type: [PolicySectionSchema], default: [] },
    terms:    { type: [PolicySectionSchema], default: [] },
  },
  updatedAt: { type: Date, default: Date.now },
});

SettingsSchema.pre("save", function () {
  this.updatedAt = Date.now();
});

export default mongoose.models.Setting ||
  mongoose.model("Setting", SettingsSchema);
