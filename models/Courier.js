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
  },
  { timestamps: true },
);

export default mongoose.models.Courier || mongoose.model('Courier', CourierSchema);
