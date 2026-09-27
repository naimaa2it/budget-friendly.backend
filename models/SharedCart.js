import mongoose from "mongoose";

const SharedCartItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    color: { type: String, default: null },
    size: { type: String, default: null },
    // Legacy single generic variant group (e.g. Type=Charging).
    attrGroup: { type: String, default: null },
    attrValue: { type: String, default: null },
    // Full combined variant selection, e.g. { Color: "White", Type: "8 Pin" }.
    attributes: { type: Object, default: null },
  },
  { _id: false },
);

const SharedCartSchema = new mongoose.Schema({
  items: { type: [SharedCartItemSchema], default: [] },
  createdByUserId: { type: String, default: null },
  viewCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Shared cart links auto-expire 90 days after creation
SharedCartSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.models.SharedCart ||
  mongoose.model("SharedCart", SharedCartSchema);
