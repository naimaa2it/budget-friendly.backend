import AutomationRule from "../models/AutomationRule.js";
import AutomationLog from "../models/AutomationLog.js";
import { sendAdminAlert } from "./mailer.js";
import logger from "./logger.js";

/**
 * Central keyword automation engine.
 *
 * Every channel (on-site reviews, live chat, Facebook comments/DM, order
 * lifecycle) normalises its incoming message into a single `evt` shape and
 * calls `runAutomation(evt)`. The engine finds the first matching enabled
 * rule (by priority) and performs its actions, then writes an AutomationLog
 * row for auditing + de-duplication.
 *
 * Write the logic once here; reuse from every channel.
 *
 * evt = {
 *   channel:  "review" | "chat" | "facebook" | "order",
 *   text:     "the customer's message",
 *   sourceId: "review:<productId>:<idx>",   // stable id for dedupe
 *   meta:     { name, product, productId, email, ... },  // for templates/notify
 *   ctx:      { review, product, ... }       // live refs channel handlers mutate
 * }
 */

// ---- matching -------------------------------------------------------------

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    // strip punctuation/emoji to plain word+space (unicode aware)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(text, rule) {
  const t = normalize(text);
  if (!t || !rule.keywords?.length) return false;
  const hit = (k) => t.includes(normalize(k));
  if (rule.matchType === "all") return rule.keywords.every(hit);
  if (rule.matchType === "exact")
    return rule.keywords.some((k) => t === normalize(k));
  return rule.keywords.some(hit); // "any"
}

function fillTemplate(tpl, meta = {}) {
  return String(tpl || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    meta[key] != null ? String(meta[key]) : "",
  );
}

// ---- channel action handlers ---------------------------------------------
//
// Each channel says how to perform an action. Generic handlers below apply to
// every channel. Add a new channel by registering its object here — the engine
// and every rule keep working unchanged.

const genericHandlers = {
  async notify_admin(evt, action) {
    await sendAdminAlert({
      subject: `[Automation] "${action._ruleName}" fired on ${evt.channel}`,
      html: `<p>A <b>${evt.channel}</b> message matched rule <b>${action._ruleName}</b>.</p>
             <blockquote>${(evt.text || "").slice(0, 500)}</blockquote>
             <p>From: ${evt.meta?.name || "?"} ${evt.meta?.email ? `(${evt.meta.email})` : ""}<br/>
             Product: ${evt.meta?.product || "-"}</p>`,
    });
  },
};

const channelHandlers = {
  review: {
    // post an official auto-reply attached to the review
    reply(evt, action) {
      const r = evt.ctx?.review;
      if (!r) return;
      r.adminReply = {
        body: fillTemplate(action.template, evt.meta),
        byName: evt.meta?.storeName || "Store Team",
        isAuto: true,
        createdAt: new Date(),
      };
    },
    // hide from public product page (frontend filters hidden reviews)
    hide(evt) {
      if (evt.ctx?.review) evt.ctx.review.hidden = true;
    },
    // queue for a human moderator
    flag(evt) {
      if (evt.ctx?.review) evt.ctx.review.flagged = true;
    },
    tag(evt, action) {
      const r = evt.ctx?.review;
      if (!r) return;
      r.tags = Array.from(new Set([...(r.tags || []), action.tag].filter(Boolean)));
    },
  },
  // chat / facebook / order handlers get added in their phases.
};

async function dispatch(action, rule, evt) {
  const perChannel = channelHandlers[evt.channel] || {};
  const handler = perChannel[action.type] || genericHandlers[action.type];
  if (!handler) {
    logger.warn(
      { channel: evt.channel, action: action.type },
      "[automation] no handler for action",
    );
    return;
  }
  // pass rule name through for the notify template
  await handler(evt, { ...action, _ruleName: rule.name });
}

// ---- engine ---------------------------------------------------------------

/**
 * Run the automation pipeline for one incoming message.
 * @returns {Promise<{matched: boolean, rule?: string, actions?: string[]}>}
 *
 * NOTE: channel handlers may mutate `evt.ctx` (e.g. set review.hidden).
 * The CALLER is responsible for persisting those mutations (e.g. prod.save()),
 * because only the caller holds the parent document.
 */
export async function runAutomation(evt) {
  try {
    if (!evt?.text || !evt?.channel) return { matched: false };

    const rules = await AutomationRule.find({
      enabled: true,
      channel: { $in: [evt.channel, "any"] },
    })
      .sort({ priority: -1, createdAt: 1 })
      .lean();

    for (const rule of rules) {
      if (!matches(evt.text, rule)) continue;

      // anti-spam: this rule already fired on this exact source? skip.
      if (evt.sourceId) {
        const dup = await AutomationLog.findOne({
          sourceId: evt.sourceId,
          matchedRuleId: rule._id,
        }).lean();
        if (dup) return { matched: false, reason: "duplicate" };
      }

      const done = [];
      for (const action of rule.actions || []) {
        await dispatch(action, rule, evt);
        done.push(action.type);
      }

      await AutomationLog.create({
        channel: evt.channel,
        sourceId: evt.sourceId || `${evt.channel}:${Date.now()}`,
        matchedRuleId: rule._id,
        ruleName: rule.name,
        incomingText: (evt.text || "").slice(0, 1000),
        actionsTaken: done,
      });

      logger.info(
        { rule: rule.name, channel: evt.channel, actions: done },
        "[automation] rule fired",
      );
      return { matched: true, rule: rule.name, actions: done };
    }

    return { matched: false };
  } catch (err) {
    // automation must never break the underlying request (review submit etc.)
    logger.error({ err: err.message }, "[automation] runAutomation failed");
    return { matched: false, error: err.message };
  }
}

export const _test = { normalize, matches, fillTemplate };
