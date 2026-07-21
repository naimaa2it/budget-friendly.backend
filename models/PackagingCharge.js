import mongoose from "mongoose";

const PackagingChargeSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: Number,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.models.PackagingCharge ||
  mongoose.model("PackagingCharge", PackagingChargeSchema);
