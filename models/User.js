import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  mobile: { type: String },
  dob: { type: String },
  image: { type: String },
  imagePublicId: { type: String },
  role: { type: String, enum: ["user", "admin", "moderator"], default: "user" },
  provider: {
    type: String,
    enum: ["firebase", "google", "local"],
    default: "local",
  },
  hashedPassword: { type: String },
  isVerified: { type: Boolean, default: false },
  resetToken: { type: String },
  resetExpires: { type: Date },
  newsletterSubscribed: { type: Boolean, default: false },
  addresses: [
    {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        default: () => new mongoose.Types.ObjectId(),
      },
      fullName: String,
      email: String,
      phone: String,
      city: String,
      zone: String,
      address: String,
      type: { type: String, enum: ["Home", "Office"], default: "Home" },
    },
  ],
  tags: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerTag",
    },
  ],
  rewardPointsBalance: { type: Number, default: 0 },
  savedCart: {
    type: {
      items: [{
        productId: { type: String, default: '' },
        title: { type: String, default: '' },
        image: { type: String, default: '' },
        price: { type: Number, default: 0 },
        quantity: { type: Number, default: 1 },
        color: { type: String, default: null },
        size: { type: String, default: null },
      }],
      updatedAt: { type: Date, default: null },
    },
    default: null,
  },
  wishlist: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
