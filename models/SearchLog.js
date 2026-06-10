import mongoose from 'mongoose';

const SearchLogSchema = new mongoose.Schema(
  {
    term: { type: String, required: true, index: true },
    count: { type: Number, default: 1 },
    lastSearchedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

export default mongoose.model('SearchLog', SearchLogSchema);
