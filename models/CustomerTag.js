import mongoose from "mongoose";

const CustomerTagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    color: {
      type: String,
      default: "#3B82F6",
    },
    description: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.models.CustomerTag ||
  mongoose.model("CustomerTag", CustomerTagSchema);
