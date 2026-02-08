import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  image: { type: String },
  role: { type: String, enum: ['user', 'admin', 'moderator'], default: 'user' },
  provider: { type: String, enum: ['firebase', 'google', 'local'], default: 'local' },
  hashedPassword: { type: String },
  isVerified: { type: Boolean, default: false },
  resetToken: { type: String },
  resetExpires: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
