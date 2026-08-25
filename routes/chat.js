import express from "express";
import ChatConversation from "../models/ChatConversation.js";
import ChatMessage from "../models/ChatMessage.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requirePermission } from "../lib/permissions.js";
import { matchFaqAnswer } from "../lib/faqMatch.js";
import { generalLimiter } from "../lib/rateLimiters.js";

const router = express.Router();

const MAX_LEN = 1000;
const SITE = process.env.FRONTEND_ORIGIN || "https://pickob.com";

// Quick-reply menu shown in the widget. Same list the frontend renders as
// buttons; clicking a button just sends its text, which we match here too.
export const QUICK_REPLIES = [
  { key: "track", emoji: "📦", label: "Track Order", text: "Track order" },
  { key: "delivery", emoji: "🚚", label: "Delivery", text: "Delivery charge koto?" },
  { key: "products", emoji: "🛍️", label: "Products", text: "Products dekhte chai" },
  { key: "agent", emoji: "👤", label: "Agent", text: "Agent er sathe kotha bolbo" },
];

// intent → canned answer (typical e-commerce chatbot behaviour)
const INTENTS = [
  {
    keys: ["track order", "order koi", "order kothay", "amar order", "parcel koi", "track"],
    reply: `Order track korte ekhane jaan 👉 ${SITE}/track-order — ba apnar order number ta ekhane likhun, dekhe dicchi 🙂`,
  },
  {
    keys: ["delivery", "shipping", "charge", "koto taka", "kobe pabo", "koto din", "cash on"],
    reply:
      "Dhaka'r moddhe delivery charge 60-80৳, Dhaka'r baire 120-150৳. Dhaka'y 1-2 din, baire 2-4 diner moddhe delivery. Cash on Delivery (COD) available ✅",
  },
  {
    keys: ["product", "kinbo", "kinte", "ki ache", "available", "dekhte chai", "koto dam", "dam koto"],
    reply: `Amader shob product ekhane dekhun 🛍️ 👉 ${SITE} — ki khujchen bolun, help kori.`,
  },
  {
    keys: ["agent", "human", "manush", "kotha bolbo", "customer care", "call", "phone"],
    reply:
      "Ekjon team member shigroi apnar sathe jogajog korbe 🙏 doya kore apnar phone number likhe din.",
    flag: true,
  },
];

function normalize(t) {
  return String(t || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

// Decide the bot's reply: menu intent → site FAQ → soft human handoff.
async function botAnswer(text) {
  const t = normalize(text);
  for (const it of INTENTS) {
    if (it.keys.some((k) => t.includes(normalize(k)))) return { reply: it.reply, flag: !!it.flag };
  }
  const faq = await matchFaqAnswer(text);
  if (faq) return { reply: faq.answer, flag: false };
  return {
    reply: "Dhonnobad! 🙏 amader ekjon team member shigroi apnar message er reply debe.",
    flag: true,
  };
}

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

    const { reply, flag } = await botAnswer(text);
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
  } catch {
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

export default router;
