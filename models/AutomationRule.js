import mongoose from "mongoose";

/**
 * A single automation rule. Moderators create these from the dashboard
 * (no code needed). Every incoming message from any channel — on-site
 * reviews, live chat, Facebook comments/DM, order lifecycle events — is
 * run against the enabled rules by lib/ruleEngine.js.
 *
 * The first matching rule (highest priority) wins and its actions fire.
 */
const ActionSchema = new mongoose.Schema(
  {
    // reply  -> post/send a template message back
    // hide   -> hide the review/comment from public view
    // flag   -> mark for a human to look at (dashboard queue)
    // notify_admin -> email the store owner
    // tag    -> attach a label (e.g. "angry-customer") for later filtering
    type: {
      type: String,
      enum: ["reply", "hide", "flag", "notify_admin", "tag"],
      required: true,
    },
    // used by "reply". Supports {{name}} and {{product}} placeholders.
    template: { type: String, default: "" },
    // used by "tag"
    tag: { type: String, default: "" },
  },
  { _id: false },
);

const AutomationRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    // which source this rule applies to. "any" = all channels.
    channel: {
      type: String,
      enum: ["any", "review", "chat", "facebook", "order"],
      default: "any",
      index: true,
    },

    // keywords are matched case-insensitively against the incoming text.
    keywords: { type: [String], default: [] },

    // any   -> at least one keyword present
    // all   -> every keyword present
    // exact -> the whole message equals one of the keywords
    matchType: {
      type: String,
      enum: ["any", "all", "exact"],
      default: "any",
    },

    // free label so you can group rules ("negative", "faq", "greeting")
    sentiment: { type: String, default: "neutral" },

    actions: { type: [ActionSchema], default: [] },

    // higher number = checked first. First match wins.
    priority: { type: Number, default: 0, index: true },

    enabled: { type: Boolean, default: true, index: true },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
);

AutomationRuleSchema.pre("save", function () {
  this.updatedAt = new Date();
  // store keywords lowercased/trimmed so matching stays cheap at runtime
  this.keywords = (this.keywords || [])
    .map((k) => String(k).trim().toLowerCase())
    .filter(Boolean);
});

AutomationRuleSchema.index({ enabled: 1, channel: 1, priority: -1 });

export default mongoose.models.AutomationRule ||
  mongoose.model("AutomationRule", AutomationRuleSchema);
