import mongoose from "mongoose";

// Singleton document holding the flat shipping charges used as the default
// (fallback) rate whenever no zone/area-specific override applies.
const ShippingSettingsSchema = new mongoose.Schema(
  {
    insideDhakaCharge: {
      type: Number,
      required: true,
      default: 70,
    },
    outsideDhakaCharge: {
      type: Number,
      required: true,
      default: 130,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.models.ShippingSettings ||
  mongoose.model("ShippingSettings", ShippingSettingsSchema);
