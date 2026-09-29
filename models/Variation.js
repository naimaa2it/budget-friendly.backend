import mongoose from 'mongoose';

const VariationOptionSchema = new mongoose.Schema({
  value: { type: String, required: true, trim: true },
}, { timestamps: false });

const VariationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  options: [VariationOptionSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// `name` already has `unique: true` above, which creates the index.
// Declaring an explicit index here too triggers a "Duplicate schema index" warning.

export default mongoose.models.Variation || mongoose.model('Variation', VariationSchema);
