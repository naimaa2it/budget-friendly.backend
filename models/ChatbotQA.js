import mongoose from "mongoose";

// Trainable knowledge base for the AI support chatbot.
//
// The store owner "trains" the bot by adding question/answer pairs from the
// dashboard. These are injected into the AI system prompt so the bot answers
// support questions in the store's own words, alongside its live product /
// order tools.
const ChatbotQASchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  answer: { type: String, required: true, trim: true },
  // optional grouping/labels for the dashboard
  tags: [{ type: String, trim: true }],
  enabled: { type: Boolean, default: true },
  // manual ordering in the dashboard list
  order: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ChatbotQASchema.pre("save", function () {
  this.updatedAt = new Date();
});

ChatbotQASchema.index({ enabled: 1, order: 1 });

export default mongoose.models.ChatbotQA ||
  mongoose.model("ChatbotQA", ChatbotQASchema);
