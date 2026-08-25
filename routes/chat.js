import express from "express";
import ChatConversation from "../models/ChatConversation.js";
import ChatMessage from "../models/ChatMessage.js";
import ChatbotQA from "../models/ChatbotQA.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requirePermission } from "../lib/permissions.js";
import { generalLimiter } from "../lib/rateLimiters.js";
import { handleChatMessage } from "../lib/chatbotEngine.js";

const router = express.Router();

const MAX_LEN = 1000;

// Quick-reply menu shown in the widget. Clicking a button sends its text, which
// the chatbot engine then handles like any typed message.
export const QUICK_REPLIES = [
  { key: "track", emoji: "📦", label: "Track Order", text: "Track order" },
  { key: "delivery", emoji: "🚚", label: "Delivery", text: "Delivery charge koto?" },
  { key: "products", emoji: "🛍️", label: "Products", text: "Products dekhte chai" },
  { key: "agent", emoji: "👤", label: "Agent", text: "Agent er sathe kotha bolbo" },
];

// ===========================================================================
// PUBLIC — site visitor
// ===========================================================================

router.post("/message", generalLimiter, async (req, res) => {
  try {
    const { visitorId, body, name, email } = req.body;
    if (!visitorId || typeof visitorId !== "string")
      return res.status(400).json({ error: "visitorId is required" });
    if (!body?.trim()) return res.status(400).json({ error: "Message is required" });
    const text = body.trim().slice(0, MAX_LEN);

    let convo = await ChatConversation.findOne({ visitorId });
    const isNew = !convo;
    if (!convo) {
      convo = await ChatConversation.create({
        visitorId,
        name: name?.trim() || "",
        email: email?.trim() || "",
      });
    } else {
      if (name && !convo.name) convo.name = name.trim();
      if (email && !convo.email) convo.email = email.trim();
    }

    if (isNew) {
      await ChatMessage.create({
        conversationId: convo._id,
        sender: "bot",
        body: `Assalamu Alaikum${convo.name ? " " + convo.name : ""}! 👋 kivabe help korte pari? Niche theke bachai korun ba likhun.`,
      });
    }

    await ChatMessage.create({ conversationId: convo._id, sender: "visitor", body: text });

    // FREE rule-based chatbot: trained Q&A + product search + guided order flow.
    // No paid API. Conversation state persists on convo.botState.
    const meta = {
      clientIp:
        (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
        req.socket?.remoteAddress ||
        "",
      userAgent: req.headers["user-agent"] || "chatbot",
      deviceId: req.body.deviceId || "",
    };
    const turn = await handleChatMessage({
      text,
      state: convo.botState,
      meta,
    });
    const reply = turn.reply;
    const flag = !!turn.flag;
    convo.botState = turn.state || {};
    convo.markModified("botState");

    await ChatMessage.create({ conversationId: convo._id, sender: "bot", body: reply });

    convo.lastMessage = text;
    convo.lastMessageAt = new Date();
    convo.unreadForAdmin = (convo.unreadForAdmin || 0) + 1;
    if (flag) convo.flagged = true;
    await convo.save();

    const messages = await ChatMessage.find({ conversationId: convo._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
    res.json({ conversationId: convo._id, messages, quickReplies: QUICK_REPLIES });
  } catch (err) {
    console.error("[chat/message] error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Poll the visitor's thread (picks up admin replies too).
router.get("/thread", async (req, res) => {
  try {
    const { visitorId } = req.query;
    if (!visitorId) return res.status(400).json({ error: "visitorId is required" });
    const convo = await ChatConversation.findOne({ visitorId }).lean();
    if (!convo) return res.json({ conversationId: null, messages: [], quickReplies: QUICK_REPLIES });
    const messages = await ChatMessage.find({ conversationId: convo._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
    res.json({ conversationId: convo._id, messages, quickReplies: QUICK_REPLIES });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ===========================================================================
// ADMIN — support inbox
// ===========================================================================

router.use(requireAdmin);
router.use(requirePermission("chat.manage"));

router.get("/conversations", async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const conversations = await ChatConversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .lean();
    res.json({ conversations });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const convo = await ChatConversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });
    if (convo.unreadForAdmin) {
      convo.unreadForAdmin = 0;
      await convo.save();
    }
    const messages = await ChatMessage.find({ conversationId: convo._id })
      .sort({ createdAt: 1 })
      .lean();
    res.json({ conversation: convo, messages });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/conversations/:id/reply", async (req, res) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: "Message is required" });
    const convo = await ChatConversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });
    const msg = await ChatMessage.create({
      conversationId: convo._id,
      sender: "admin",
      body: body.trim().slice(0, MAX_LEN),
    });
    convo.lastMessage = msg.body;
    convo.lastMessageAt = new Date();
    await convo.save();
    res.json({ message: msg });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/conversations/:id", async (req, res) => {
  try {
    const convo = await ChatConversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ error: "Conversation not found" });
    if (req.body.status) convo.status = req.body.status;
    if (typeof req.body.flagged === "boolean") convo.flagged = req.body.flagged;
    await convo.save();
    res.json({ conversation: convo });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ===========================================================================
// ADMIN — chatbot training (Q&A knowledge base)
// ===========================================================================

router.get("/training", async (req, res) => {
  try {
    const items = await ChatbotQA.find().sort({ order: 1, createdAt: 1 }).lean();
    // Free rule-based bot is always active (no API key required).
    res.json({ items, aiEnabled: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/training", async (req, res) => {
  try {
    const { question, answer, tags, enabled, order } = req.body;
    if (!question?.trim() || !answer?.trim())
      return res.status(400).json({ error: "Question and answer are required" });
    const item = await ChatbotQA.create({
      question: question.trim(),
      answer: answer.trim(),
      tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [],
      enabled: enabled !== false,
      order: Number(order) || 0,
      createdBy: req.admin?._id || null,
    });
    res.json({ item });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/training/:id", async (req, res) => {
  try {
    const item = await ChatbotQA.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    const { question, answer, tags, enabled, order } = req.body;
    if (question != null) item.question = String(question).trim();
    if (answer != null) item.answer = String(answer).trim();
    if (tags != null)
      item.tags = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [];
    if (typeof enabled === "boolean") item.enabled = enabled;
    if (order != null) item.order = Number(order) || 0;
    await item.save();
    res.json({ item });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/training/:id", async (req, res) => {
  try {
    const del = await ChatbotQA.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
