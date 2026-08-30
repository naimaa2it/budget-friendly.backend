import mongoose from "mongoose";

/**
 * One live-chat conversation between a site visitor and the store.
 * Visitors are identified by a client-generated `visitorId` (stored in the
 * browser's localStorage) so a guest keeps the same thread across page loads
 * without needing to log in.
 */
const ChatConversationSchema = new mongoose.Schema({
  visitorId: { type: String, required: true, index: true },

  // optional details the visitor may share
  name: { type: String, default: "" },
  email: { type: String, default: "" },
  phone: { type: String, default: "" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Technical fingerprint captured from the chat request. Lets the inbox show
  // *something* for anonymous visitors, and — crucially — link a chat to any
  // order placed from the same browser/IP to reveal the real customer.
  clientIp: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  deviceId: { type: String, default: "", index: true },

  status: { type: String, enum: ["open", "closed"], default: "open", index: true },

  // set by automation (flag action) so admins can triage
  flagged: { type: Boolean, default: false },
  tags: { type: [String], default: [] },

  lastMessage: { type: String, default: "" },
  lastMessageAt: { type: Date, default: Date.now, index: true },

  // how many visitor messages the admin hasn't seen yet
  unreadForAdmin: { type: Number, default: 0 },

  // State-machine data for the free rule-based support chatbot (current step
  // in the guided order flow + draft order). Persists across page reloads.
  botState: { type: mongoose.Schema.Types.Mixed, default: {} },

  createdAt: { type: Date, default: Date.now },
});

ChatConversationSchema.index({ status: 1, lastMessageAt: -1 });

export default mongoose.models.ChatConversation ||
  mongoose.model("ChatConversation", ChatConversationSchema);
