import mongoose from "mongoose";

// Per-zone or per-area shipping charge override, scoped to Dhaka.
// `zone` is a Dhaka upazila/city-corporation name (e.g. "Dhamrai").
// `area` is a union/ward within that zone (e.g. "Sutipara"); left null the
// override applies to the whole zone. Lookup priority at quote time is
// area override > zone override > inside/outside-Dhaka default.
const ShippingZoneRateSchema = new mongoose.Schema(
  {
    zone: {
      type: String,
      required: true,
      trim: true,
    },
    area: {
      type: String,
      default: null,
      trim: true,
    },
    charge: {
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

ShippingZoneRateSchema.index({ zone: 1, area: 1 }, { unique: true });

export default mongoose.models.ShippingZoneRate ||
  mongoose.model("ShippingZoneRate", ShippingZoneRateSchema);
