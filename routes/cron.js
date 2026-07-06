import express from "express";
import logger from "../lib/logger.js";
import { sendAbandonedCartEmail } from "../lib/mailer.js";
import { syncActiveShipments } from "../lib/shipmentTracking.js";
import {
  permanentlyDeleteProducts,
  TRASH_RETENTION_MS,
} from "../lib/productCleanup.js";

const router = express.Router();

// Vercel Hobby plan only allows daily native cron, so these jobs (which need
// 5-15 min cadence) are triggered by an external pinger (e.g. cron-job.org)
// instead. Protect them with a shared secret since they're public URLs.
function requireCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "CRON_SECRET not configured" });
  }
  const provided = req.headers["x-cron-secret"] || req.query.secret;
  if (provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

router.use(requireCronSecret);

router.all("/flash-sale-expiry", async (req, res) => {
  try {
    const { default: Product } = await import("../models/Product.js");
    const result = await Product.updateMany(
      { flashSale: true, flashSaleEndsAt: { $lt: new Date() } },
      { $set: { flashSale: false } },
    );
    res.json({ ok: true, modified: result.modifiedCount });
  } catch (err) {
    logger.error({ err }, "Flash sale expiry cron failed");
    res.status(500).json({ error: "Server error" });
  }
});

router.all("/abandoned-cart", async (req, res) => {
  if (process.env.ABANDONED_CART_EMAILS !== "true") {
    return res.json({ ok: true, skipped: true });
  }
  try {
    const { default: CheckoutSession } = await import(
      "../models/CheckoutSession.js"
    );
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const sessions = await CheckoutSession.find({
      userEmail: { $exists: true, $ne: null, $ne: "" },
      status: "incomplete",
      completedAt: null,
      abandonedEmailSent: { $ne: true },
      updatedAt: { $lt: oneHourAgo },
    })
      .limit(50)
      .lean();

    let sent = 0;
    for (const session of sessions) {
      try {
        await sendAbandonedCartEmail(session);
        await CheckoutSession.updateOne(
          { _id: session._id },
          {
            $set: {
              abandonedEmailSent: true,
              abandonedEmailSentAt: new Date(),
            },
          },
        );
        sent++;
      } catch (emailErr) {
        logger.warn(
          { err: emailErr, sessionId: session._id },
          "Abandoned cart email failed",
        );
      }
    }
    res.json({ ok: true, sent, found: sessions.length });
  } catch (err) {
    logger.error({ err }, "Abandoned cart cron failed");
    res.status(500).json({ error: "Server error" });
  }
});

// Permanently remove products that have sat in the trash past the retention
// window (30 days). Recycle-bin cleanup — runs alongside the other pingers.
router.all("/trash-cleanup", async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
    const deleted = await permanentlyDeleteProducts({
      deletedAt: { $ne: null, $lt: cutoff },
    });
    res.json({ ok: true, deleted });
  } catch (err) {
    logger.error({ err }, "Trash cleanup cron failed");
    res.status(500).json({ error: "Server error" });
  }
});

router.all("/shipment-sync", async (req, res) => {
  try {
    const results = await syncActiveShipments(25);
    const synced = results.filter((r) => r.ok && !r.skipped).length;
    res.json({ ok: true, synced, total: results.length });
  } catch (err) {
    logger.error({ err }, "Shipment sync cron failed");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
