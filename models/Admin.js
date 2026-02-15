import mongoose from 'mongoose';

const AdminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  hashedPassword: { type: String, required: true },
  role: { type: String, enum: ['admin', 'moderator'], default: 'admin', required: true },
  
  // Security fields
  isActive: { type: Boolean, default: true }, // can be disabled by super admin
  isLocked: { type: Boolean, default: false }, // locked after too many failed attempts
  lockUntil: { type: Date }, // auto-unlock after this time
  loginAttempts: { type: Number, default: 0 },
  lastLoginAt: { type: Date },
  lastLoginIP: { type: String },
  
  // Password reset
  resetToken: { type: String },
  resetExpires: { type: Date },
  
  // Audit fields
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, // which admin created this account
  updatedAt: { type: Date, default: Date.now }
});

// Virtual field to check if account is currently locked
AdminSchema.virtual('isCurrentlyLocked').get(function() {
  return this.isLocked && this.lockUntil && this.lockUntil > Date.now();
});

// Middleware to update 'updatedAt' on save
// Use synchronous pre-save hook (avoid calling `next` to prevent "next is not a function" issues)
AdminSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Method to increment login attempts and lock account if necessary
AdminSchema.methods.incLoginAttempts = async function() {
  // If we have a previous lock that has expired, restart attempts at 0
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1, isLocked: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = 5;
  const lockTime = 30 * 60 * 1000; // 30 minutes

  // Lock the account if max attempts reached
  if (this.loginAttempts + 1 >= maxAttempts && !this.isCurrentlyLocked) {
    updates.$set = { isLocked: true, lockUntil: Date.now() + lockTime };
  }

  return this.updateOne(updates);
};

// Method to reset login attempts on successful login
AdminSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1, isLocked: 1 }
  });
};

export default mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
