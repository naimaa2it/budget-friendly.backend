import mongoose from "mongoose";

/**
 * One row per automation fire. Two jobs:
 *  1. Audit trail — see exactly what the bot did and why.
 *  2. Anti-spam — the engine checks here so the same rule does not fire
 *     twice on the same source (e.g. re-processing the same review).
 */
const AutomationLogSchema = new mongoose.Schema({
  channel: { type: String, required: true, index: true },

  // stable id of the thing that triggered it, e.g. "review:<productId>:<idx>"
  // or "order:<orderId>" or "fb:<commentId>". Used for dedupe.
  sourceId: { type: String, required: true, index: true },

  matchedRuleId: { type: mongoose.Schema.Types.ObjectId, ref: "AutomationRule" },
  ruleName: { type: String },

  incomingText: { type: String },

  // snapshot of what the bot actually did
  actionsTaken: { type: [String], default: [] },

  createdAt: { type: Date, default: Date.now, index: true },
});

// fast dedupe lookup
AutomationLogSchema.index({ sourceId: 1, matchedRuleId: 1 });

export default mongoose.models.AutomationLog ||
  mongoose.model("AutomationLog", AutomationLogSchema);
