import express from "express";
import AutomationRule from "../models/AutomationRule.js";
import AutomationLog from "../models/AutomationLog.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { runAutomation, _test } from "../lib/ruleEngine.js";

const router = express.Router();

// All automation endpoints are admin-only.
router.use(requireAdmin);

// ---- Rules CRUD -----------------------------------------------------------

// List rules (optionally filter by channel)
router.get("/rules", async (req, res) => {
  try {
    const filter = {};
    if (req.query.channel) filter.channel = req.query.channel;
    const rules = await AutomationRule.find(filter)
      .sort({ priority: -1, createdAt: 1 })
      .lean();
    res.json({ rules });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// Create a rule
router.post("/rules", async (req, res) => {
  try {
    const { name, channel, keywords, matchType, sentiment, actions, priority, enabled } =
      req.body;
    if (!name?.trim())
      return res.status(400).json({ error: "Rule name is required" });
    if (!Array.isArray(keywords) || keywords.length === 0)
      return res.status(400).json({ error: "At least one keyword is required" });
    const rule = await AutomationRule.create({
      name: name.trim(),
      channel: channel || "any",
      keywords,
      matchType: matchType || "any",
      sentiment: sentiment || "neutral",
      actions: Array.isArray(actions) ? actions : [],
      priority: Number(priority) || 0,
      enabled: enabled !== false,
    });
    res.status(201).json({ rule });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update a rule
router.put("/rules/:id", async (req, res) => {
  try {
    const rule = await AutomationRule.findById(req.params.id);
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    const fields = [
      "name",
      "channel",
      "keywords",
      "matchType",
      "sentiment",
      "actions",
      "priority",
      "enabled",
    ];
    for (const f of fields) if (f in req.body) rule[f] = req.body[f];
    await rule.save();
    res.json({ rule });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a rule
router.delete("/rules/:id", async (req, res) => {
  try {
    const r = await AutomationRule.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ error: "Rule not found" });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ---- Test / preview -------------------------------------------------------

// Dry-run a piece of text against the rules WITHOUT performing side effects.
// Lets a moderator see which rule would fire before saving. No log, no ctx.
router.post("/test", async (req, res) => {
  try {
    const { text, channel = "any" } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });
    const rules = await AutomationRule.find({
      enabled: true,
      channel: { $in: [channel, "any"] },
    })
      .sort({ priority: -1, createdAt: 1 })
      .lean();
    const first = rules.find((r) => _test.matches(text, r));
    res.json({
      matched: !!first,
      rule: first
        ? { id: first._id, name: first.name, actions: first.actions }
        : null,
      normalized: _test.normalize(text),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Logs -----------------------------------------------------------------

router.get("/logs", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const filter = {};
    if (req.query.channel) filter.channel = req.query.channel;
    const logs = await AutomationLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ logs });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
