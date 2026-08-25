import Setting from "../models/Setting.js";

/**
 * Lightweight FAQ matcher for the chat bot.
 *
 * Lets the store maintain support Q&A in ONE place — the existing site FAQ
 * (Setting.faq, the same list shown on /faq) — and have the chat bot answer
 * from it automatically. Used as a fallback when no automation rule matches.
 *
 * Matching is a simple shared-word overlap between the visitor's message and
 * each FAQ question (stopwords removed). Cheap, no external service.
 */

// common Bangla (romanized) + English words that carry no matching signal
const STOP = new Set([
  "ami", "amar", "amader", "tumi", "apni", "apnar", "eta", "ota", "ei", "oi",
  "koto", "kobe", "kothay", "kivabe", "ki", "ki", "ke", "kon", "kore", "korbo",
  "hobe", "hoy", "ache", "chai", "jonno", "diye", "theke", "ar", "o", "na",
  "ta", "gulo", "kore", "vai", "bhai", "please", "plz",
  "the", "a", "an", "is", "are", "do", "does", "how", "what", "when", "where",
  "can", "i", "my", "me", "you", "your", "to", "of", "for", "and", "or",
]);

function tokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

let _cache = null;
let _cacheAt = 0;
const TTL = 60_000;

async function getFaqs() {
  const now = Date.now();
  if (_cache && now - _cacheAt < TTL) return _cache;
  try {
    const s = await Setting.findOne().select("faq").lean();
    _cache = (s?.faq || []).filter((f) => f.question && f.answer);
  } catch {
    _cache = [];
  }
  _cacheAt = now;
  return _cache;
}

/**
 * Returns the best-matching FAQ answer for a message, or null.
 * Requires at least 2 shared meaningful words (or 1 if the question is very
 * short) so it doesn't answer on a single incidental word.
 */
export async function matchFaqAnswer(message) {
  const msgTokens = new Set(tokens(message));
  if (msgTokens.size === 0) return null;

  const faqs = await getFaqs();
  let best = null;
  let bestScore = 0;

  for (const f of faqs) {
    const qTokens = tokens(f.question);
    if (!qTokens.length) continue;
    const overlap = qTokens.filter((w) => msgTokens.has(w)).length;
    const threshold = qTokens.length <= 2 ? 1 : 2;
    if (overlap >= threshold && overlap > bestScore) {
      bestScore = overlap;
      best = f;
    }
  }

  return best ? { question: best.question, answer: best.answer } : null;
}

export function _clearFaqCache() {
  _cache = null;
  _cacheAt = 0;
}
