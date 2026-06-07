import mongoose from 'mongoose';

const TimelinePresetSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    statusKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.models.TimelinePreset ||
  mongoose.model('TimelinePreset', TimelinePresetSchema);
