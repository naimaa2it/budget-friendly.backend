// FREE rule-based support chatbot — no paid LLM / API.
//
// Handles Bangla / English / Banglish by keyword matching. It can:
//   - answer trained Q&A (keyword overlap against the ChatbotQA knowledge base)
//   - search the live product DB (e.g. "6 antenna router")
//   - take an order via a step-by-step guided flow, validate BD phone + address,
//     place a confirmed COD order and email the customer.
//
// Conversation state is a small state-machine object stored on
// ChatConversation.botState (Mixed).

import Product from "../models/Product.js";
import ChatbotQA from "../models/ChatbotQA.js";
import Setting from "../models/Setting.js";
import { resolveAndQuote } from "../routes/orders.js";
import { placeChatbotOrder } from "./chatbotOrder.js";
import {
  isValidBdPhone,
  normalizeBdPhone,
  matchDistrict,
} from "./bdValidation.js";

const money = (n) => `${Math.round(Number(n) || 0)}৳`;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Convert Bangla numerals (০-৯) to ASCII so "৩ টা" parses like "3 ta".
const BN_DIGITS = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
const toAsciiDigits = (t) => String(t || "").replace(/[০-৯]/g, (d) => BN_DIGITS[d]);

// ── text helpers ─────────────────────────────────────────────────────────────
function normalize(t) {
  return String(t || "")
    .toLowerCase()
    // keep letters, numbers, AND combining marks (\p{M}) — Bangla vowel signs
    // (matras) are marks; stripping them shatters words like "ডেলিভারি".
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "ami","amar","amader","tumi","apni","apnar","eta","ota","ei","oi","ki","ke",
  "kon","kore","korbo","hobe","hoy","ache","chai","jonno","diye","theke","ar",
  "o","na","ta","gulo","vai","bhai","please","plz","the","a","an","is","are",
  "do","does","how","what","when","where","can","i","my","me","you","your","to",
  "of","for","and","or","koto","dam",
  // common Bangla filler/verb words that carry no matching signal
  "আছে","করা","যাবে","যায়","পারব","পারবো","দেন","চাই","হবে","কি","কী","করতে",
  "কোন","একটা","আমার","আমি","এটা","কত","কতো","হয়","পাব","পাবো","নিব","নিবো",
]);

// Bangla → canonical Banglish, so a query in any script maps to the same
// tokens (e.g. "ডেলিভারি"/"delivery" both become "delivery"). This is what lets
// pure-Bangla, Banglish, and English questions all match the same trained Q&A.
const SYN = {
  "ডেলিভারি": "delivery", "ডেলিভারী": "delivery",
  "চার্জ": "charge", "খরচ": "charge",
  "টাকা": "taka", "মূল্য": "price", "দাম": "price",
  "দিন": "din", "সময়": "time", "কবে": "kobe", "কতদিন": "din",
  "ওয়ারেন্টি": "warranty", "গ্যারান্টি": "warranty",
  "অর্ডার": "order", "কিনব": "kinbo", "কিনতে": "kinte", "কিনবো": "kinbo",
  "রিটার্ন": "return", "ফেরত": "return", "রিফান্ড": "refund",
  "এক্সচেঞ্জ": "exchange", "পরিবর্তন": "exchange", "বদল": "exchange",
  "ক্যান্সেল": "cancel", "বাতিল": "cancel",
  "পেমেন্ট": "payment", "অগ্রিম": "advance", "আগাম": "advance",
  "নাম্বার": "number", "নম্বর": "number", "ফোন": "phone", "যোগাযোগ": "contact",
  "স্টক": "stock", "ডিসকাউন্ট": "discount", "কুপন": "coupon", "অফার": "offer",
  "অরিজিনাল": "original", "আসল": "original", "নকল": "fake",
  "নষ্ট": "nosto", "ভাঙা": "damaged", "ড্যামেজ": "damaged",
  "পাইকারি": "wholesale", "বাল্ক": "bulk",
  "খোলা": "open", "বন্ধ": "bondho",
  "এলাকা": "area", "জেলা": "district", "থানা": "thana", "ঠিকানা": "address",
  "বাংলাদেশ": "bangladesh", "কিভাবে": "kivabe", "কীভাবে": "kivabe",
  "পণ্য": "product", "প্রোডাক্ট": "product", "ট্র্যাক": "track",
  "কত": "koto",
  // common product terms → English, so Bangla product searches hit the
  // (mostly English) product titles.
  "ঘড়ি": "watch", "হেডফোন": "headphone", "ইয়ারফোন": "earphone",
  "ইয়ারবাড": "earbud", "চার্জার": "charger", "স্পিকার": "speaker",
  "ফ্যান": "fan", "ব্যাটারি": "battery", "রাউটার": "router", "মাউস": "mouse",
  "কিবোর্ড": "keyboard", "নেকব্যান্ড": "neckband", "পাওয়ার": "power",
};

// Bangla attaches case/number suffixes to nouns (বাংলাদেশ+ে, চার্জ+ে). Strip a
// common trailing suffix when it exposes a known synonym, so "বাংলাদেশে" maps
// to the same token as "বাংলাদেশ". Longest suffixes first.
const BN_SUFFIXES = ["গুলো", "গুলি", "টার", "য়ে", "ের", "তে", "এর", "কে", "টা", "টি", "য়", "র", "ে"];
function stem(w) {
  if (SYN[w]) return SYN[w];
  for (const suf of BN_SUFFIXES) {
    if (w.length > suf.length + 1 && w.endsWith(suf)) {
      const base = w.slice(0, -suf.length);
      if (SYN[base]) return SYN[base];
    }
  }
  return w;
}

function keywords(t) {
  return normalize(t)
    .split(/\s+/)
    .map(stem)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function has(text, list) {
  const n = normalize(text);
  return list.some((k) => n.includes(k));
}

// intent keyword sets (Banglish + Bangla + English)
const KW = {
  greeting: ["hi","hello","hey","assalam","salam","আসসালাম","হ্যালো","hallo","nomoskar"],
  order: ["order","kinbo","kinte","kena","kinte chai","nibo","nite chai","buy","purchase","কিনব","অর্ডার","kinbo","kimbo"],
  cancel: ["cancel","batil","বাতিল","na thak","thak","cancel koro","bad dao","stop"],
  yes: ["haa","ha","hae","hyaa","yes","confirm","ok","okay","thik ache","accha","জি","হ্যাঁ","yep","done"],
  track: [
    "track","order koi","order kothay","parcel koi","track order","koi amar order",
    "order kobe","kobe asbe","asche na","order status","order ta kobe","order asche",
    "delivery kobe","kobe pabo order","আসবে না","কবে আসবে","অর্ডার কই","ট্র্যাক",
  ],
};

// ── product search (DB, free) ────────────────────────────────────────────────
async function searchProducts(query, max = 6) {
  const base = { status: "published", deletedAt: null };
  let results = [];
  try {
    results = await Product.find(
      { ...base, $text: { $search: query } },
      { score: { $meta: "textScore" } },
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(max)
      .lean();
  } catch {
    results = [];
  }
  if (results.length < max) {
    const words = keywords(query).slice(0, 6);
    if (words.length) {
      const rx = words.map((w) => new RegExp(escapeRegex(w), "i"));
      const or = [];
      for (const r of rx)
        or.push({ title: r }, { description: r }, { tags: r }, { department: r }, { category: r });
      const seen = new Set(results.map((p) => p._id.toString()));
      const more = await Product.find({ ...base, $or: or }).limit(max * 2).lean();
      for (const p of more) {
        if (results.length >= max) break;
        if (!seen.has(p._id.toString())) {
          seen.add(p._id.toString());
          results.push(p);
        }
      }
    }
  }
  return results.slice(0, max);
}

function priceOf(p) {
  return p.flashSale && p.flashSalePrice ? p.flashSalePrice : p.price;
}

// ── Q&A keyword matcher (free) ───────────────────────────────────────────────
async function matchQA(text) {
  const qas = await ChatbotQA.find({ enabled: true })
    .sort({ order: 1, createdAt: 1 })
    .limit(300)
    .lean();
  const msg = new Set(keywords(text));
  if (!msg.size) return null;

  // Weighted scoring: a match on a curated TAG is a strong intent signal
  // (weight 2), a match on a question word is weaker (weight 1). Accept the
  // best QA scoring >= 2 — so a single tag hit (e.g. "warranty", "number")
  // is enough, while an incidental question-word overlap alone is not.
  let best = null;
  let bestScore = 0;
  for (const q of qas) {
    const tagWords = new Set(keywords((q.tags || []).join(" ")));
    const qWords = new Set(keywords(q.question));
    let score = 0;
    for (const w of msg) {
      if (tagWords.has(w)) score += 2;
      else if (qWords.has(w)) score += 1;
    }
    if (score >= 2 && score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return best ? best.answer : null;
}

async function storeInfo() {
  const s = await Setting.findOne().lean().catch(() => null);
  return {
    name: s?.storeName || process.env.STORE_NAME || "Pickob",
    phone: s?.supportInfo?.phone || process.env.STORE_PHONE || "",
    site: process.env.FRONTEND_ORIGIN || "https://pickob.com",
  };
}

// ── order-flow prompts ───────────────────────────────────────────────────────
const ASK = {
  qty: "কয়টা নেবেন? (যেমন: 1, 2)",
  name: "আপনার পুরো নামটা লিখুন 🙂",
  email: "আপনার ইমেইল অ্যাড্রেসটা দিন (অর্ডার কনফার্মেশন এখানে পাঠাবো)।",
  phone: "আপনার মোবাইল নাম্বার দিন (বাংলাদেশি, যেমন 01712345678)।",
  city: "আপনার জেলা/শহরের নাম লিখুন (যেমন: ঢাকা / Dhaka, চট্টগ্রাম / Chattogram)।",
  zone: "থানা/উপজেলার নাম লিখুন।",
  address: "সম্পূর্ণ ডেলিভারি ঠিকানা দিন (বাসা/রোড/গ্রাম, এলাকা)।",
};

// Compute total via the real pricing engine (shipping depends on address).
async function quoteDraft(draft) {
  return resolveAndQuote(
    draft.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    null,
    null,
    draft.city,
    0,
    draft.zone || null,
    draft.area || null,
  );
}

// ── main entry ───────────────────────────────────────────────────────────────
// Returns { reply, state, order?, flag? }. NEVER throws — any unexpected error
// returns a friendly reply and preserves the customer's current state so their
// order progress isn't lost (they can just re-answer the same step).
export async function handleChatMessage(args) {
  try {
    return await _handle(args);
  } catch (err) {
    console.error("[chatbot] handle error:", err);
    const state =
      args?.state && typeof args.state === "object" && !Array.isArray(args.state)
        ? args.state
        : {};
    return {
      reply:
        'একটু সমস্যা হলো 🙈 — আবার একটু লিখুন। সমস্যা থাকলে "cancel" লিখে নতুন করে শুরু করতে পারেন।',
      state,
      flag: true,
    };
  }
}

async function _handle({ text, state, meta = {} }) {
  let s = state && typeof state === "object" && !Array.isArray(state) ? { ...state } : {};
  s.draft = s.draft && typeof s.draft === "object" ? s.draft : {};

  // Guard against a stale / malformed saved state (e.g. an order step with no
  // items from an interrupted older session) — reset to idle rather than throw.
  const ITEM_STEPS = ["qty", "name", "phone", "email", "city", "zone", "address", "confirm", "confirm_single"];
  if (ITEM_STEPS.includes(s.step) && !(Array.isArray(s.items) && s.items.length)) {
    s = { draft: {} };
  }
  if (s.step === "choose_product" && !(Array.isArray(s.candidates) && s.candidates.length)) {
    s = { draft: {} };
  }
  const step = s.step || null;

  // universal cancel
  if (step && has(text, KW.cancel)) {
    return { reply: "ঠিক আছে, বাতিল করে দিলাম ❌। অন্য কিছু দরকার হলে বলুন 🙂", state: {} };
  }

  // ═══ ordering state machine ═══
  if (step === "choose_product") {
    const pick = resolvePick(text, s.candidates);
    if (pick) {
      s = { step: "qty", items: [{ productId: pick.productId, quantity: 1 }], _titles: { [pick.productId]: pick.title } };
      return { reply: `"${pick.title}" — দাম ${money(pick.price)}।\n${ASK.qty}`, state: s };
    }
    // Not a pick from the shown list. The customer may have typed a NEW product
    // or a new question — reset and fall through to fresh idle handling instead
    // of getting stuck re-asking "which one?".
    s = { draft: {} };
  }

  if (step === "confirm_single") {
    if (has(text, KW.yes)) {
      s = { step: "qty", items: s.items, _titles: s._titles };
      return { reply: ASK.qty, state: s };
    }
    // treat as a new query
    s = {};
  }

  if (step === "qty") {
    const n = parseQty(text);
    s.items[0].quantity = n;
    s.step = "name";
    s.draft = {};
    return { reply: `ঠিক আছে, ${n} টা ✅\n${ASK.name}`, state: s };
  }

  if (step === "name") {
    if (normalize(text).length < 2)
      return { reply: ASK.name, state: s };
    s.draft.name = text.trim();
    s.step = "phone";
    return { reply: ASK.phone, state: s };
  }

  if (step === "phone") {
    if (!isValidBdPhone(text)) {
      return {
        reply: "নাম্বারটা ঠিক মনে হচ্ছে না 🙈 — একটা সঠিক বাংলাদেশি মোবাইল নাম্বার দিন (যেমন 01712345678)।",
        state: s,
      };
    }
    s.draft.phone = normalizeBdPhone(text);
    s.step = "email";
    return { reply: ASK.email, state: s };
  }

  if (step === "email") {
    if (!/.+@.+\..+/.test(text.trim())) {
      return { reply: "ইমেইলটা ঠিক নেই 🙂 — সঠিক ইমেইল দিন (যেমন name@gmail.com)।", state: s };
    }
    s.draft.email = text.trim();
    s.step = "city";
    return { reply: ASK.city, state: s };
  }

  if (step === "city") {
    const d = matchDistrict(text);
    if (!d) {
      return {
        reply: "এই জেলাটা আমাদের লিস্টে পেলাম না 🙈 — সঠিক জেলার নাম দিন (যেমন: ঢাকা/Dhaka, চট্টগ্রাম/Chattogram, খুলনা/Khulna, সিলেট/Sylhet)।",
        state: s,
      };
    }
    s.draft.city = d.title;
    s.step = "zone";
    return { reply: ASK.zone, state: s };
  }

  if (step === "zone") {
    s.draft.zone = text.trim();
    s.step = "address";
    return { reply: ASK.address, state: s };
  }

  if (step === "address") {
    if (normalize(text).length < 6) {
      return { reply: "ঠিকানাটা একটু বিস্তারিত দিন (বাসা/রোড/গ্রাম, এলাকা)।", state: s };
    }
    s.draft.address = text.trim();
    // build quote + summary
    const draft = { items: s.items, city: s.draft.city, zone: s.draft.zone, area: "" };
    let quote;
    try {
      quote = await quoteDraft(draft);
    } catch (e) {
      console.error("[chatbot] quote error:", e);
      // keep the customer at the address step so they can re-enter it (or cancel)
      // rather than losing the whole order they just filled in.
      return {
        reply:
          'ঠিকানা/দাম হিসাব করতে একটু সমস্যা হলো 🙈 — ঠিকানাটা আরেকবার লিখুন, অথবা "cancel" লিখুন।',
        state: s,
        flag: true,
      };
    }
    s.step = "confirm";
    s._quote = { total: quote.total, shipping: quote.shipping, subtotal: quote.subtotal };
    const lines = quote.items
      .map((i) => `• ${i.title} × ${i.quantity} — ${money(i.price * i.quantity)}`)
      .join("\n");
    const summary =
      `অর্ডারটা একবার দেখে নিন 👇\n${lines}\n` +
      `ডেলিভারি চার্জ: ${money(quote.shipping)}\n` +
      `মোট (ক্যাশ অন ডেলিভারি): ${money(quote.total)}\n\n` +
      `নাম: ${s.draft.name}\nফোন: ${s.draft.phone}\nঠিকানা: ${s.draft.address}, ${s.draft.zone}, ${s.draft.city}\n\n` +
      `কনফার্ম করতে "হ্যাঁ" লিখুন ✅ (বাতিল করতে "cancel")।`;
    return { reply: summary, state: s };
  }

  if (step === "confirm") {
    if (has(text, KW.yes)) {
      const res = await placeChatbotOrder({
        items: s.items,
        customer: {
          name: s.draft.name,
          phone: s.draft.phone,
          email: s.draft.email,
          city: s.draft.city,
          zone: s.draft.zone,
          area: "",
          address: s.draft.address,
          note: "Chatbot order",
        },
        meta,
      });
      if (!res.ok) {
        return { reply: `অর্ডার প্লেস করতে সমস্যা হলো: ${res.error}`, state: {}, flag: true };
      }
      return {
        reply:
          `অর্ডার কনফার্ম হয়ে গেছে ✅\n` +
          `অর্ডার আইডি: ${res.orderIdSuffix}\n` +
          `মোট: ${money(res.total)} (ক্যাশ অন ডেলিভারি)\n` +
          (res.emailSent ? `কনফার্মেশন ইমেইল ${s.draft.email} এ পাঠিয়ে দিয়েছি 📧\n` : "") +
          `ধন্যবাদ! 🙏\n\n` +
          `আরও কিছু লাগলে এখানেই লিখুন, অথবা নতুন অর্ডার দিতে উপরে "New chat"-এ চাপ দিন 🙂`,
        state: {},
        order: res,
      };
    }
    return { reply: `কনফার্ম করতে "হ্যাঁ" লিখুন, অথবা বাতিল করতে "cancel"।`, state: s };
  }

  if (step === "awaiting_product_name") {
    s = {}; // fall through to product search below with cleared state
  }

  // ═══ idle: greeting / QA / product search / order intent ═══
  if (has(text, KW.greeting) && keywords(text).length <= 3) {
    return {
      reply: `আসসালামু আলাইকুম! 👋 কীভাবে সাহায্য করতে পারি? পণ্যের নাম লিখলে দাম ও অর্ডারের তথ্য জানিয়ে দিচ্ছি 🙂`,
      state: {},
    };
  }

  const info = await storeInfo();

  if (has(text, KW.track)) {
    return {
      reply: `অর্ডার ট্র্যাক করতে এখানে যান 👉 ${info.site}/track-order`,
      state: {},
    };
  }

  // trained Q&A first (support questions)
  const qa = await matchQA(text);
  if (qa) return { reply: qa, state: {} };

  // product search
  const products = await searchProducts(text, 6);
  if (products.length === 1) {
    const p = products[0];
    return {
      reply:
        `${p.title}\nদাম: ${money(priceOf(p))}\n${(p.description || "").slice(0, 160)}\n\n` +
        `অর্ডার করতে চাইলে "হ্যাঁ" লিখুন ✅`,
      state: {
        step: "confirm_single",
        items: [{ productId: p._id.toString(), quantity: 1 }],
        _titles: { [p._id.toString()]: p.title },
      },
    };
  }
  if (products.length > 1) {
    const list = products
      .map((p, i) => `${i + 1}. ${p.title} — ${money(priceOf(p))}`)
      .join("\n");
    return {
      reply: `এই পণ্যগুলো পেলাম 👇\n${list}\n\nকোনটা নেবেন? নাম্বার লিখুন (1, 2…) অথবা নাম লিখুন।`,
      state: {
        step: "choose_product",
        candidates: products.map((p) => ({
          productId: p._id.toString(),
          title: p.title,
          price: priceOf(p),
        })),
      },
    };
  }

  // order intent but nothing matched → ask what product
  if (has(text, KW.order)) {
    return {
      reply: "কোন পণ্যটি অর্ডার করতে চান? পণ্যের নাম লিখুন 🙂",
      state: { step: "awaiting_product_name" },
    };
  }

  // nothing matched → soft human handoff
  return {
    reply: `ধন্যবাদ! 🙏 আমাদের একজন টিম মেম্বার শীঘ্রই আপনার মেসেজের রিপ্লাই দেবে।${info.phone ? " অথবা কল করুন: " + info.phone : ""}`,
    state: {},
    flag: true,
  };
}

// pick a product from a numbered list or by name
function resolvePick(text, candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const n = normalize(text);
  const num = parseInt((toAsciiDigits(text).match(/\d+/) || [])[0], 10);
  if (num >= 1 && num <= candidates.length) return candidates[num - 1];
  return (
    candidates.find((c) => normalize(c.title) === n) ||
    candidates.find((c) => normalize(c.title).includes(n) || n.includes(normalize(c.title))) ||
    null
  );
}

function parseQty(text) {
  const m = toAsciiDigits(text).match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 1;
  return Math.min(Math.max(n || 1, 1), 99);
}

