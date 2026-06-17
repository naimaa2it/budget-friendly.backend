import mongoose from 'mongoose';

const CardSchema = new mongoose.Schema({
  image:    { url: String, public_id: String },
  subtitle: { type: String, default: '' },   // e.g. "Up to 29% OFF | Starting from ৳35,990"
  label:    { type: String, default: '' },   // e.g. "Air Conditioners"
  link:     { type: String, default: '/' },  // where clicking the card goes
}, { _id: true });

const OccasionSectionSchema = new mongoose.Schema({
  title:       { type: String, required: true },   // e.g. "Eid Fest on Kitchen Appliances!"
  titleBn:     { type: String, default: '' },      // Bangla title
  viewAllLink: { type: String, default: '/' },
  isActive:    { type: Boolean, default: true },
  order:       { type: Number, default: 0 },
  cards:       { type: [CardSchema], default: [] },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});

OccasionSectionSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

export default mongoose.models.OccasionSection ||
  mongoose.model('OccasionSection', OccasionSectionSchema);
