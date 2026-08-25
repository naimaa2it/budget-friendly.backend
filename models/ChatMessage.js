import mongoose from "mongoose";

/**
 * A single message inside a ChatConversation.
 * sender: "visitor" (the customer), "bot" (keyword automation auto-reply),
 * or "admin" (a human moderator).
 */
const ChatMessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatConversation",
    required: true,
    index: true,
  },
  sender: {
    type: String,
    enum: ["visitor", "bot", "admin"],
    required: true,
  },
  body: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

ChatMessageSchema.index({ conversationId: 1, createdAt: 1 });

export default mongoose.models.ChatMessage ||
  mongoose.model("ChatMessage", ChatMessageSchema);
