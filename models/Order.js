import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    productId: String,
    title: String,
    price: Number,
    quantity: Number,
    image: String,
    color: { type: String, default: null },
    size: { type: String, default: null },
    rewardPoints: { type: Number, default: 0 },
  },
  { _id: false },
);

const BillingSchema = new mongoose.Schema(
  {
    name: String,
    phone: String,
    email: String,
    city: String,
    zone: String,
    area: String,
    address: String,
    note: String,
  },
  { _id: false },
);

const AppliedCouponSchema = new mongoose.Schema(
  {
    code: String,
    discountValue: Number,
  },
  { _id: false },
);

const TrackingEventSchema = new mongoose.Schema(
  {
    status: String,
    message: String,
    at: { type: Date, default: Date.now },
    source: {
      type: String,
      enum: ["admin", "courier", "system"],
      default: "courier",
    },
  },
  { _id: false },
);

const StatusHistorySchema = new mongoose.Schema(
  {
    previousStatus: { type: String, default: null },
    newStatus: { type: String, required: true },
    reason: { type: String, default: "" },
    changedBy: { type: String, default: "system" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const AssignedAgentSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderAgent",
      default: null,
    },
    name: { type: String, default: null },
    phone: { type: String, default: null },
    courierName: { type: String, default: null },
    assignedAt: { type: Date, default: null },
  },
  { _id: false },
);

const ShipmentSchema = new mongoose.Schema(
  {
    courier: {
      type: String,
      default: null,
    },
    trackingId: { type: String, default: null },
    trackingUrl: { type: String, default: null },
    courierStatus: { type: String, default: null },
    handedToCourierAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
    trackingEvents: { type: [TrackingEventSchema], default: [] },
  },
  { _id: false },
);

const OrderSchema = new mongoose.Schema({
  userId: { type: String, default: null }, // MongoDB _id as string (may be null for guests)
  userEmail: { type: String, default: null },
  items: { type: [OrderItemSchema], required: true },
  billingDetails: { type: BillingSchema, required: true },
  subtotal: { type: Number, required: true },
  shipping: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  paymentMethod: {
    type: String,
    enum: ["cash-on-delivery", "online", "bkash"],
    default: "cash-on-delivery",
  },
  couponCode: { type: String, default: null },
  appliedCoupons: { type: [AppliedCouponSchema], default: [] },
  status: {
    type: String,
    enum: [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "failed",
      "cancelled",
    ],
    default: "pending",
  },
  paymentStatus: {
    type: String,
    enum: ["unpaid", "cod", "paid", "failed", "cancelled"],
    default: "unpaid",
  },
  transactionId: { type: String, default: null },
  valId: { type: String, default: null },
  paidAmount: { type: Number, default: null },
  // COD orders auto-confirm 30 min after creation; cancellable before this time
  confirmAfter: { type: Date, default: null },
  shipment: { type: ShipmentSchema, default: () => ({ trackingEvents: [] }) },
  assignedAgent: { type: AssignedAgentSchema, default: null },
  rewardPointsEarned: { type: Number, default: 0 },
  rewardPointsRedeemed: { type: Number, default: 0 },
  rewardPointsDiscount: { type: Number, default: 0 },
  rewardPointsCredited: { type: Boolean, default: false },
  rewardPointsCreditedAt: { type: Date, default: null },
  statusHistory: { type: [StatusHistorySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

OrderSchema.pre("save", async function () {
  this.updatedAt = new Date();
});

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);
