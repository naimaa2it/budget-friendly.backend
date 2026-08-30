import mongoose from "mongoose";

// Atomic named sequence generator. One document per counter (e.g. "orderNo").
// Uses findByIdAndUpdate with $inc, which is atomic in MongoDB, so concurrent
// order placements can never receive the same number.
const CounterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

const Counter =
  mongoose.models.Counter || mongoose.model("Counter", CounterSchema);

// Returns the next sequential order number. Starts at 100000 so the value is
// always at least 6 digits (rendered as e.g. "pk100000"). First order → 100000.
export async function getNextOrderNo() {
  const doc = await Counter.findByIdAndUpdate(
    "orderNo",
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return 99999 + doc.seq; // seq 1 → 100000, seq 2 → 100001, …
}

export default Counter;
