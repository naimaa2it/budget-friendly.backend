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

// Pick a random item — used to vary canned replies so the bot doesn't repeat
// the exact same wording every time and feels less robotic / more human.
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Small conversational openers we can sprinkle before a substantive reply, so
// two identical questions don't get two byte-identical answers.
const ACK = ["", "", "জি 🙂 ", "আচ্ছা, ", "অবশ্যই 🙂 ", "ঠিক আছে, "];

// Human-like phrasing pools. pick() one each time it's used.
const SAY = {
  greeting: [
    "আসসালামু আলাইকুম! 👋 কীভাবে সাহায্য করতে পারি? পণ্যের নাম লিখলে দাম ও অর্ডারের তথ্য জানিয়ে দিচ্ছি 🙂",
    "হ্যালো! 👋 স্বাগতম 🙂 কী খুঁজছেন? পণ্যের নাম লিখলেই দাম আর ডিটেইলস দিয়ে দিচ্ছি।",
    "আসসালামু আলাইকুম 🌸 বলুন কীভাবে হেল্প করতে পারি — যেকোনো পণ্যের নাম লিখুন, বাকিটা আমি দেখছি 🙂",
    "হাই! 👋 আমি আছি আপনার পাশে 🙂 কোন পণ্যটা নিয়ে জানতে চান?",
  ],
  thanks: [
    "আপনাকেও অসংখ্য ধন্যবাদ 🙏 আরও কিছু দরকার হলে নির্দ্বিধায় বলুন 🙂",
    "স্বাগতম 🙂 আরও কিছু লাগলে আমি তো আছিই 🙏",
    "খুশি হলাম সাহায্য করতে পেরে 🥰 আরও কিছু জানতে চাইলে বলুন।",
    "ধন্যবাদ আপনাকেও 🙏 যেকোনো দরকারে আবার নক করবেন 🙂",
  ],
  cancel: [
    "ঠিক আছে, বাতিল করে দিলাম ❌। অন্য কিছু দরকার হলে বলুন 🙂",
    "আচ্ছা, বাদ দিলাম 🙂 আবার যখন লাগবে, বলবেন।",
    "কোনো সমস্যা নেই — বাতিল করলাম ✅ অন্য কিছু খুঁজলে সাহায্য করছি 🙂",
  ],
  notUnderstood: [
    "ঠিক বুঝতে পারিনি 🙈",
    "একটু বুঝতে পারলাম না 🙈",
    "দুঃখিত, ঠিক ধরতে পারলাম না 🙈",
  ],
  agent: [
    "ঠিক আছে 🙂 আমাদের একজন টিম মেম্বারকে জানিয়ে দিচ্ছি — একটু পরেই এখানে রিপ্লাই পাবেন।",
    "অবশ্যই 🙂 আমি আমাদের একজনকে বলে দিচ্ছি, একটু অপেক্ষা করুন — শীঘ্রই এখানে উত্তর পাবেন।",
    "জি, ধরিয়ে দিচ্ছি 🙂 আমাদের টিমের একজন একটু পরেই আপনাকে এখানে রিপ্লাই দেবেন।",
  ],
  handoff: [
    "ধন্যবাদ! 🙏 আপনার প্রশ্নটা আমাদের একজন টিম মেম্বারকে দিয়ে দিচ্ছি — শীঘ্রই এখানে রিপ্লাই পাবেন।",
    "এই ব্যাপারটা আমাদের টিমের একজন ভালো বলতে পারবেন 🙂 জানিয়ে দিচ্ছি, একটু পরেই রিপ্লাই পাবেন।",
    "একটু দাঁড়ান 🙂 আপনার প্রশ্নটা আমাদের একজনকে দিয়ে দিলাম — শীঘ্রই এখানে উত্তর আসছে।",
  ],
};

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
  // filler/verb words that carry no product-matching signal (Banglish)
  "lagbe","lagbe","laagbe","dorkar","darkar","nibo","nibe","proyojon","lage","chaii",
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
  // service / support vocabulary customers commonly type in Bangla
  "বিকাশ": "bkash", "নগদ": "nagad", "রকেট": "rocket",
  "কিস্তি": "installment", "ইএমআই": "emi",
  "দোকান": "shop", "শপ": "shop", "লোকেশন": "location",
  "রিভিউ": "review", "কোয়ালিটি": "quality", "মান": "quality",
  "সাইজ": "size", "কালার": "color", "রঙ": "color", "মডেল": "model",
  "ছবি": "image", "স্পেসিফিকেশন": "specification", "ফিচার": "feature",
  "ফ্রি": "free", "গিফট": "gift", "উপহার": "gift",
  "কনফার্ম": "confirm", "কমাবেন": "komano", "কমানো": "komano",
  // common product terms → English, so Bangla product searches hit the
  // (mostly English) product titles.
  "ঘড়ি": "watch", "হেডফোন": "headphone", "ইয়ারফোন": "earphone",
  "ইয়ারবাড": "earbud", "চার্জার": "charger", "স্পিকার": "speaker",
  "ফ্যান": "fan", "ব্যাটারি": "battery", "রাউটার": "router", "মাউস": "mouse",
  "কিবোর্ড": "keyboard", "নেকব্যান্ড": "neckband", "পাওয়ার": "power",
  "মোবাইল": "mobile", "ল্যাপটপ": "laptop", "টিভি": "tv", "কভার": "cover",
  "কেবল": "cable", "ক্যাবল": "cable", "ট্রিমার": "trimmer", "লাইট": "light",
  "গ্যাজেট": "gadget", "স্মার্ট": "smart",
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
//
// NOTE: has() matches these against the RAW normalized text (no SYN/stem), so
// every Bangla phrasing a customer might actually type has to be listed here in
// Bangla too — not just its Banglish form. Avoid bare short Bangla tokens that
// occur inside unrelated words (e.g. "থাক" is inside "থাকি"), or they cause
// false positives during the order flow where cancel/yes are checked.
const KW = {
  greeting: [
    "hi","hello","hey","assalam","salam","hallo","nomoskar","kemon achen",
    "how are you","good morning","good evening","good afternoon",
    "আসসালাম","আসসালামু","হ্যালো","হাই","নমস্কার","আদাব","সালাম",
    "কেমন আছেন","কেমন আছো","শুভ সকাল","শুভ দুপুর","শুভ বিকাল","শুভ সন্ধ্যা",
  ],
  thanks: [
    "thanks","thank you","thank u","thanku","thnx","tnx","tqsm","ty",
    "dhonnobad","onek dhonnobad","dhonnobaad","shukriya","thx",
    "ধন্যবাদ","অসংখ্য ধন্যবাদ","শুকরিয়া","থ্যাংকস","থ্যাংক ইউ",
  ],
  agent: [
    "agent","human","real person","real manush","manush er sathe","representative",
    "live agent","support agent","customer care agent","agent er sathe","manusher sathe",
    "real human","talk to human","customer care","customer support","কথা বলবো",
    "কথা বলতে চাই","প্রতিনিধি","এজেন্ট","মানুষের সাথে","একজন মানুষ","লাইভ এজেন্ট",
    "কাস্টমার কেয়ার","কাস্টমার সাপোর্ট","টিম মেম্বার",
  ],
  browse: [
    "products dekhte","product dekhte","products dekhbo","product dekhbo","ki ki product",
    "product list","products list","sob product","all products","all product","catalog",
    "ki ki ache","ki ki paoa jay","product gula","koto product","browse",
    "পণ্য দেখব","পণ্য দেখতে","প্রোডাক্ট দেখব","প্রোডাক্ট দেখতে","কি কি আছে","কী কী আছে",
    "কি কি পণ্য","কি কি পাওয়া যায়","সব পণ্য","সব প্রোডাক্ট","পণ্যের তালিকা","প্রোডাক্ট গুলো",
  ],
  order: [
    "order","kinbo","kinte","kena","kinte chai","nibo","nite chai","buy","purchase","kimbo",
    "কিনব","কিনবো","কিনতে","কিনতে চাই","কেনা","অর্ডার","অর্ডার করব","অর্ডার দিব",
    "অর্ডার করতে চাই","নিব","নিবো","নিতে চাই",
  ],
  cancel: [
    "cancel","batil","na thak","na lagbe","cancel koro","bad dao","stop","lagbe na","dorkar nei",
    "বাতিল","না থাক","লাগবে না","দরকার নেই","দরকার নাই","বাদ দেন","বাদ দাও","বন্ধ করেন",
  ],
  yes: [
    "haa","ha","hae","hyaa","yes","confirm","confirmed","ok","okay","okk","thik ache","accha",
    "yep","done","obossoi","nibo",
    "জি","জ্বি","জ্বী","জী","হ্যাঁ","হ্যা","হা","আচ্ছা","ঠিক আছে","ঠিকাছে","অবশ্যই","ওকে",
    "কনফার্ম","কনফার্ম করেন","করব","করবো","নিব","নিবো",
  ],
  track: [
    "track","order koi","order kothay","parcel koi","track order","koi amar order",
    "order kobe","kobe asbe","asche na","order status","order ta kobe","order asche",
    "delivery kobe","kobe pabo order",
    "আসবে না","কবে আসবে","অর্ডার কই","অর্ডার কোথায়","আমার অর্ডার কোথায়","পার্সেল কোথায়",
    "কবে পাবো","কবে পাব","ডেলিভারি কবে","অর্ডার স্ট্যাটাস","অর্ডারটা কবে","ট্র্যাক",
  ],
};

// ── small talk (free, no LLM) ────────────────────────────────────────────────
// Conversational / meta messages that aren't product or order requests
// ("who are you", "how are you", "what can you do", compliments…). Answering
// these instead of dead-ending to a human is what makes the bot feel like it
// "understands anything". Each entry: keyword triggers (Bangla + Banglish +
// English) → one of several friendly replies. {store} is filled with the shop name.
const SMALLTALK = [
  {
    k: ["tumi ke","apni ke","tomar naam","tomar nam","tor naam","who are you","your name","naam ki",
        "তুমি কে","আপনি কে","কে তুমি","কে আপনি","তোমার নাম","আপনার নাম","নাম কি","নাম কী"],
    a: [
      "আমি {store}-এর সাপোর্ট অ্যাসিস্ট্যান্ট 🤖 পণ্য খুঁজে দেওয়া, দাম বলা আর অর্ডার নিতে পারি 🙂 বলুন কী দরকার।",
      "আমি {store}-এর হেল্প অ্যাসিস্ট্যান্ট 🙂 পণ্যের নাম বা যেকোনো প্রশ্ন লিখুন — সাহায্য করছি।",
    ],
  },
  {
    k: ["kemon acho","kemon acho","kemon achen","how are you","ki khobor","ki obostha",
        "কেমন আছো","কেমন আছেন","কি খবর","কী খবর","কি অবস্থা"],
    a: [
      "আলহামদুলিল্লাহ, ভালো আছি 🙂 আপনি কেমন আছেন? বলুন কীভাবে সাহায্য করতে পারি 🌸",
      "ভালো আছি, ধন্যবাদ 🙂 আপনি কেমন আছেন? কোন পণ্য নিয়ে জানতে চান?",
    ],
  },
  {
    k: ["tumi ki bot","are you a bot","bot naki","robot","manush naki","tumi ki manush",
        "তুমি কি বট","বট নাকি","তুমি কি রোবট","মানুষ নাকি","তুমি কি মানুষ"],
    a: [
      "আমি একটা সাপোর্ট বট 🤖 তবে চেষ্টা করি মানুষের মতোই হেল্প করতে 🙂 দরকারে আমাদের টিমের একজনকেও ডেকে দিতে পারি।",
    ],
  },
  {
    k: ["ki korte paro","ki koro","what can you do","tumi ki koro","kivabe help","how can you help",
        "তুমি কি করতে পারো","কি কি করতে পারো","কিভাবে সাহায্য","কীভাবে সাহায্য"],
    a: [
      "আমি পারি 👇\n• পণ্য খুঁজে দাম বলতে\n• অর্ডার নিতে (ক্যাশ অন ডেলিভারি)\n• ডেলিভারি / পেমেন্ট / ওয়ারেন্টি প্রশ্নের উত্তর দিতে\n\nশুধু পণ্যের নাম বা প্রশ্ন লিখুন 🙂",
    ],
  },
  {
    k: ["bhalobasi","valobasi","love you","luv u","tomake valo","cute","sundor","best bot",
        "ভালোবাসি","লাভ ইউ","তোমাকে ভালো","কিউট","সুন্দর"],
    a: [
      "আপনিও অনেক ভালো 🥰 ধন্যবাদ! বলুন কীভাবে সাহায্য করতে পারি 🙂",
    ],
  },
  {
    k: ["joke","koutuk","funny","hasao","হাসাও","কৌতুক","মজা"],
    a: [
      "হাহা 😄 কৌতুকের চেয়ে ভালো ডিল দিতে পারি — কোন পণ্যটা খুঁজছেন বলুন তো 🙂",
    ],
  },
  {
    k: ["sorry","dukkhito","maf koro","স্যরি","সরি","দুঃখিত","মাফ কর"],
    a: [
      "আরে না, ঠিক আছে 🙂 বলুন কীভাবে সাহায্য করতে পারি।",
    ],
  },
];

// Try to answer a conversational / meta message. Returns a reply string or null.
async function smallTalk(text) {
  for (const item of SMALLTALK) {
    if (has(text, item.k)) {
      const info = await storeInfo();
      return pick(item.a).replace(/\{store\}/g, info.name);
    }
  }
  return null;
}

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

// ── brand listing (department = brand, e.g. asus / ryans / cosrx) ─────────────
// Filler words that may accompany a bare brand query ("asus er product",
// "samsung gula dekhbo") but shouldn't stop it counting as a pure brand query.
const BRAND_FILLER = new Set([
  "product", "products", "item", "items", "brand", "er", "gula", "gulo", "guli",
  "show", "list", "dekhbo", "dekhabo", "dekhate", "dekhi", "dekhben", "dekhte",
  "sob", "all", "kichu", "available", "stock",
]);

// Cache the distinct brand list (5 min) — avoids a DB scan on every message.
let _brandCache = { at: 0, list: [] };
async function getBrands() {
  const now = Date.now();
  if (_brandCache.list.length && now - _brandCache.at < 5 * 60 * 1000) return _brandCache.list;
  const depts = await Product.distinct("department", {
    status: "published",
    deletedAt: null,
    department: { $nin: [null, ""] },
  }).catch(() => []);
  _brandCache = { at: now, list: depts };
  return depts;
}

// Return the brand (department value) when the query is essentially JUST a
// brand name (+ filler) — so "asus" / "asus products" lists the whole brand,
// but "asus router" still goes to normal search.
async function matchBrandQuery(text) {
  const kws = keywords(text);
  if (!kws.length) return null;
  const nText = normalize(text);
  const brands = await getBrands();
  for (const d of brands) {
    const dn = normalize(d);
    if (!dn || dn.length < 2) continue;
    const dWords = dn.split(/\s+/);
    const mentioned = nText.includes(dn) || dWords.every((w) => kws.includes(w));
    if (!mentioned) continue;
    const leftover = kws.filter((w) => !dWords.includes(w) && !BRAND_FILLER.has(w));
    if (leftover.length === 0) return d;
  }
  return null;
}

// List a brand's products with the total count.
async function brandListing(brand) {
  const filter = { status: "published", deletedAt: null, department: brand };
  const total = await Product.countDocuments(filter);
  if (!total) return null;
  const MAX = 10;
  const items = await Product.find(filter).sort({ createdAt: -1 }).limit(MAX).lean();
  const label = brand.charAt(0).toUpperCase() + brand.slice(1);
  const lines = items
    .map((p, i) => `${i + 1}. ${p.title} — ${money(priceOf(p))}`)
    .join("\n");
  const more =
    total > items.length
      ? `\n\n…আরও ${total - items.length} টি পণ্য আছে। নির্দিষ্ট নাম/মডেল লিখলে দ্রুত পাবেন 🙂`
      : "";
  return {
    reply: `${label} ব্র্যান্ডে মোট ${total} টি পণ্য আছে 👇\n${lines}${more}\n\nকোনটা নেবেন? নাম্বার লিখুন (1, 2…) অথবা নাম লিখুন।`,
    state: {
      step: "choose_product",
      candidates: items.map((p) => ({
        productId: p._id.toString(),
        title: p.title,
        price: priceOf(p),
      })),
    },
  };
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

// A support question the customer may ask in the MIDDLE of the order flow
// (delivery charge, discount, warranty, track…). If we can answer it, we do —
// and the caller re-asks the current step so the order isn't abandoned.
// Returns null when it's not a question we recognise (then it's normal input).
async function sideAnswer(text) {
  if (has(text, KW.track)) {
    const info = await storeInfo();
    return `অর্ডার ট্র্যাক করতে এখানে যান 👉 ${info.site}/track-order`;
  }
  return await matchQA(text);
}

// The prompt to repeat after answering a mid-flow side question, so the
// customer knows exactly what the bot is still waiting for.
function reAsk(step, s) {
  if (ASK[step]) return ASK[step];
  if (step === "confirm_single")
    return `অর্ডার করতে চাইলে "হ্যাঁ" লিখুন ✅ (বাতিল করতে "cancel")।`;
  if (step === "confirm")
    return `কনফার্ম করতে "হ্যাঁ" লিখুন, অথবা বাতিল করতে "cancel"।`;
  if (step === "choose_product" && Array.isArray(s.candidates)) {
    const list = s.candidates
      .map((c, i) => `${i + 1}. ${c.title} — ${money(c.price)}`)
      .join("\n");
    return `${list}\n\nকোনটা নেবেন? নাম্বার লিখুন (1, 2…) অথবা নাম লিখুন।`;
  }
  return "";
}

// Treat `text` as a fresh query: greeting, product search, or order intent.
// Returns a response object (with a RESET/next state) when it recognises one of
// those — or null when nothing matched. This is what lets a customer break out
// of a stuck step just by typing a new product name (e.g. "neckband").
async function productIntent(text) {
  if (has(text, KW.greeting) && keywords(text).length <= 3) {
    return { reply: pick(SAY.greeting), state: {} };
  }

  // "products dekhte chai" / "ki ki ache" (incl. the widget's Products button)
  // → show the latest products so the customer never dead-ends at a human handoff.
  if (has(text, KW.browse)) {
    const featured = await Product.find({ status: "published", deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();
    if (featured.length) {
      const list = featured
        .map((p, i) => `${i + 1}. ${p.title} — ${money(priceOf(p))}`)
        .join("\n");
      return {
        reply: `আমাদের নতুন কিছু পণ্য দেখুন 👇\n${list}\n\nকোনটা নেবেন? নাম্বার লিখুন (1, 2…) অথবা যেটা খুঁজছেন তার নাম লিখুন 🙂`,
        state: {
          step: "choose_product",
          candidates: featured.map((p) => ({
            productId: p._id.toString(),
            title: p.title,
            price: priceOf(p),
          })),
        },
      };
    }
  }

  // A bare brand name ("asus", "samsung products") → list the whole brand
  // with its total count, before falling to generic product search.
  const brand = await matchBrandQuery(text);
  if (brand) {
    const listing = await brandListing(brand);
    if (listing) return listing;
  }

  const products = await searchProducts(text, 8);
  if (products.length) {
    // When the query clearly names ONE product (its title/tags contain every
    // significant query word, e.g. "apple earpod"), skip the list and offer
    // that product directly — instead of dumping a generic list.
    const qw = keywords(text);
    const exact = qw.length
      ? products.filter((p) => {
          const hay = normalize(`${p.title} ${(p.tags || []).join(" ")}`);
          return qw.every((w) => hay.includes(w));
        })
      : [];
    const one = products.length === 1 ? products[0] : exact.length === 1 ? exact[0] : null;

    if (one) {
      return {
        reply:
          `${one.title}\nদাম: ${money(priceOf(one))}\n${(one.description || "").slice(0, 160)}\n\n` +
          `অর্ডার করতে চাইলে "হ্যাঁ" লিখুন ✅`,
        state: {
          step: "confirm_single",
          items: [{ productId: one._id.toString(), quantity: 1 }],
          _titles: { [one._id.toString()]: one.title },
        },
      };
    }

    const list = products
      .map((p, i) => `${i + 1}. ${p.title} — ${money(priceOf(p))}`)
      .join("\n");
    // We capped at 8 — if we hit the cap there are likely more; nudge the
    // customer to narrow down instead of implying these are the only ones.
    const more =
      products.length >= 8
        ? `\n\nআরও পণ্য আছে — নির্দিষ্ট নাম লিখলে (যেমন ব্র্যান্ড/মডেল) দ্রুত পাবেন 🙂`
        : "";
    return {
      reply: `এই পণ্যগুলো পেলাম 👇\n${list}${more}\n\nকোনটা নেবেন? নাম্বার লিখুন (1, 2…) অথবা নাম লিখুন।`,
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

  if (has(text, KW.order)) {
    return {
      reply: "কোন পণ্যটি অর্ডার করতে চান? পণ্যের নাম লিখুন 🙂",
      state: { step: "awaiting_product_name" },
    };
  }

  return null;
}

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
  const ITEM_STEPS = ["qty", "name", "phone", "city", "zone", "address", "confirm", "confirm_single"];
  if (ITEM_STEPS.includes(s.step) && !(Array.isArray(s.items) && s.items.length)) {
    s = { draft: {} };
  }
  if (s.step === "choose_product" && !(Array.isArray(s.candidates) && s.candidates.length)) {
    s = { draft: {} };
  }
  const step = s.step || null;

  // universal cancel
  if (step && has(text, KW.cancel)) {
    return { reply: pick(SAY.cancel), state: {} };
  }

  // ═══ ordering state machine ═══
  if (step === "choose_product") {
    const pick = resolvePick(text, s.candidates);
    if (pick) {
      s = { step: "qty", items: [{ productId: pick.productId, quantity: 1 }], _titles: { [pick.productId]: pick.title } };
      return { reply: `"${pick.title}" — দাম ${money(pick.price)}।\n${ASK.qty}`, state: s };
    }
    // Not a pick. If it's a support question, answer it and keep the list up.
    const side = await sideAnswer(text);
    if (side) return { reply: `${side}\n\n${reAsk("choose_product", s)}`, state: s };
    // A NEW product / order intent ("neckband") → switch to those results.
    const fresh = await productIntent(text);
    if (fresh) return fresh;
    // Otherwise keep the current list up instead of getting stuck silently.
    return { reply: `${pick(SAY.notUnderstood)} — ${reAsk("choose_product", s)}`, state: s };
  }

  if (step === "confirm_single") {
    if (has(text, KW.yes)) {
      s = { step: "qty", items: s.items, _titles: s._titles };
      return { reply: ASK.qty, state: s };
    }
    // A side question (discount? warranty?) — answer it, keep the offer open.
    const side = await sideAnswer(text);
    if (side) return { reply: `${side}\n\n${reAsk("confirm_single", s)}`, state: s };
    // A new product / order intent → switch to it.
    const fresh = await productIntent(text);
    if (fresh) return fresh;
    // Not "হ্যাঁ", not a recognised query — keep the offer open.
    return { reply: `"হ্যাঁ" লিখলে অর্ডার শুরু করি ✅, অথবা অন্য পণ্যের নাম লিখুন।`, state: s };
  }

  if (step === "qty") {
    const n = parseQtyOrNull(text);
    if (n == null) {
      // Not a number → maybe a support question ("delivery charge koto?")…
      const side = await sideAnswer(text);
      if (side) return { reply: `${side}\n\n${ASK.qty}`, state: s };
      // …or a new product / order intent ("neckband") — let them switch.
      const fresh = await productIntent(text);
      if (fresh) return fresh;
      return { reply: `একটা সংখ্যায় লিখুন 🙂 — ${ASK.qty}`, state: s };
    }
    s.items[0].quantity = n;
    s.step = "name";
    s.draft = {};
    return { reply: `ঠিক আছে, ${n} টা ✅\n${ASK.name}`, state: s };
  }

  if (step === "name") {
    if (normalize(text).length < 2)
      return { reply: ASK.name, state: s };
    const side = await sideAnswer(text);
    if (side) return { reply: `${side}\n\n${ASK.name}`, state: s };
    s.draft.name = text.trim();
    s.step = "phone";
    return { reply: ASK.phone, state: s };
  }

  if (step === "phone") {
    if (!isValidBdPhone(text)) {
      const side = await sideAnswer(text);
      if (side) return { reply: `${side}\n\n${ASK.phone}`, state: s };
      return {
        reply: "নাম্বারটা ঠিক মনে হচ্ছে না 🙈 — একটা সঠিক বাংলাদেশি মোবাইল নাম্বার দিন (যেমন 01712345678)।",
        state: s,
      };
    }
    s.draft.phone = normalizeBdPhone(text);
    // Email is not collected in chat — go straight to the address flow.
    s.step = "city";
    return { reply: ASK.city, state: s };
  }

  if (step === "city") {
    const d = matchDistrict(text);
    if (!d) {
      const side = await sideAnswer(text);
      if (side) return { reply: `${side}\n\n${ASK.city}`, state: s };
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
    const side = await sideAnswer(text);
    if (side) return { reply: `${side}\n\n${ASK.zone}`, state: s };
    if (normalize(text).length < 2) return { reply: ASK.zone, state: s };
    s.draft.zone = text.trim();
    s.step = "address";
    return { reply: ASK.address, state: s };
  }

  if (step === "address") {
    if (normalize(text).length < 6) {
      const side = await sideAnswer(text);
      if (side) return { reply: `${side}\n\n${ASK.address}`, state: s };
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
        // Bot orders start as pending (awaiting confirmation), not confirmed.
        status: "pending",
        statusReason: "Placed via support chatbot (awaiting confirmation)",
      });
      if (!res.ok) {
        return { reply: `অর্ডার প্লেস করতে সমস্যা হলো: ${res.error}`, state: {}, flag: true };
      }
      return {
        reply:
          `অর্ডারটি পেয়ে গেছি ✅ (স্ট্যাটাস: পেন্ডিং)\n` +
          `অর্ডার আইডি: ${res.orderIdSuffix}\n` +
          `মোট: ${money(res.total)} (ক্যাশ অন ডেলিভারি)\n` +
          `শীঘ্রই কনফার্ম করে জানিয়ে দেব 🙂\n` +
          (res.emailSent ? `অর্ডারের বিস্তারিত ইমেইল ${s.draft.email} এ পাঠিয়ে দিয়েছি 📧\n` : "") +
          `ধন্যবাদ! 🙏\n\n` +
          `আরও কিছু লাগলে এখানেই লিখুন, অথবা নতুন অর্ডার দিতে উপরে "New chat"-এ চাপ দিন 🥰`,
        state: {},
        order: res,
      };
    }
    // Not a confirmation — they might be asking a last-minute question.
    const side = await sideAnswer(text);
    if (side) return { reply: `${side}\n\n${reAsk("confirm", s)}`, state: s };
    return { reply: reAsk("confirm", s), state: s };
  }

  if (step === "awaiting_product_name") {
    s = {}; // fall through to product search below with cleared state
  }

  // ═══ idle: greeting / QA / product search / order intent ═══
  // A short "thank you" — acknowledge warmly, don't ping a human for it.
  if (has(text, KW.thanks) && keywords(text).length <= 4) {
    return { reply: pick(SAY.thanks), state: {} };
  }

  // Explicit "I want to talk to a real person" — hand off to the team and flag
  // it so the inbox highlights it (don't bury it under an auto-answer).
  if (has(text, KW.agent)) {
    const info = await storeInfo();
    return {
      reply: `${pick(SAY.agent)}${info.phone ? " জরুরি হলে কল করুন: " + info.phone : ""}`,
      state: {},
      flag: true,
    };
  }

  // Support questions (track + trained Q&A) first — a merchant-trained answer
  // always wins over the generic small-talk/fallback below.
  const side = await sideAnswer(text);
  if (side) return { reply: `${pick(ACK)}${side}`, state: {} };

  // …then greeting / product search / order intent.
  const fresh = await productIntent(text);
  if (fresh) return fresh;

  // Conversational / meta message ("who are you", "how are you"…) — answer it
  // like a person instead of dead-ending. No flag: it's not a real support need.
  const chat = await smallTalk(text);
  if (chat) return { reply: chat, state: {} };

  // Nothing structured matched. Rather than a bare human handoff, give a warm,
  // helpful guided reply so the customer always gets a useful next step — and
  // still flag it so the team can jump in if it was a genuine question.
  const info = await storeInfo();
  return {
    reply:
      `${pick(SAY.handoff)}\n\n` +
      `এদিকে আমি এখুনি সাহায্য করতে পারি এভাবে 👇\n` +
      `• কোনো পণ্যের নাম লিখুন — দাম ও ডিটেইলস দিয়ে দিচ্ছি\n` +
      `• "অর্ডার" লিখুন — অর্ডার করা শুরু করি\n` +
      `• ডেলিভারি / পেমেন্ট / ওয়ারেন্টি নিয়ে প্রশ্ন করুন 🙂` +
      `${info.phone ? `\n• জরুরি হলে কল করুন: ${info.phone}` : ""}`,
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

// Word quantities so "একটা" / "duita" work as well as digits.
const WORD_QTY = {
  ekta: 1, ekti: 1, "একটা": 1, "একটি": 1,
  duita: 2, duto: 2, dui: 2, "দুইটা": 2, "দুটি": 2, "দুটা": 2, "দুই": 2,
  tinta: 3, tinti: 3, tin: 3, "তিনটা": 3, "তিনটি": 3, "তিন": 3,
  charta: 4, char: 4, "চারটা": 4, "চার": 4,
  pachta: 5, pach: 5, "পাঁচটা": 5, "পাঁচ": 5,
  choyta: 6, choy: 6, "ছয়টা": 6, "ছয়": 6,
  satta: 7, sat: 7, "সাতটা": 7, "সাত": 7,
  atta: 8, at: 8, "আটটা": 8, "আট": 8,
  noyta: 9, noy: 9, "নয়টা": 9, "নয়": 9,
  doshta: 10, dosh: 10, "দশটা": 10, "দশ": 10,
};

// Parse a quantity, or return null when the text carries NO quantity signal —
// so the qty step can tell "2 ta" (an answer) apart from "delivery charge koto?"
// (a side question) instead of silently defaulting to 1.
function parseQtyOrNull(text) {
  const m = toAsciiDigits(text).match(/\d+/);
  if (m) return Math.min(Math.max(parseInt(m[0], 10) || 1, 1), 99);
  for (const w of normalize(text).split(/\s+/)) if (WORD_QTY[w]) return WORD_QTY[w];
  return null;
}

