import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import SharedCart from "../models/SharedCart.js";
import Product from "../models/Product.js";

const router = express.Router();

// POST /api/cart/share — snapshot the current cart into a shareable link (no auth required)
router.post("/share", async (req, res) => {
  try {
    const { items = [] } = req.body;
    const cleanItems = (Array.isArray(items) ? items : [])
      .slice(0, 50)
      .map((i) => ({
        productId: String(i.productId || ""),
        quantity: Math.max(1, parseInt(i.quantity) || 1),
        color: i.color || null,
        size: i.size || null,
      }))
      .filter((i) => i.productId);

    if (cleanItems.length === 0)
      return res.status(400).json({ error: "Cart is empty" });

    let userId = null;
    try {
      const token = req.cookies?.token;
      if (token) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload?.id && payload?.type !== "admin") userId = payload.id;
      }
    } catch (_) {}

    const sharedCart = await SharedCart.create({
      items: cleanItems,
      createdByUserId: userId,
    });

    res.json({ ok: true, token: sharedCart._id.toString() });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/cart/share/:token — resolve a shared cart link into live product data
router.get("/share/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!mongoose.Types.ObjectId.isValid(token))
      return res.status(404).json({ error: "Shared cart not found" });

    const sharedCart = await SharedCart.findById(token).lean();
    if (!sharedCart)
      return res.status(404).json({ error: "Shared cart not found or expired" });

    const productIds = sharedCart.items.map((i) => i.productId).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = Object.fromEntries(
      products.map((p) => [p._id.toString(), p]),
    );

    const items = sharedCart.items
      .map((i) => {
        const product = productMap[i.productId];
        if (!product) return null;
        return {
          product,
          quantity: i.quantity,
          color: i.color,
          size: i.size,
        };
      })
      .filter(Boolean);

    SharedCart.updateOne({ _id: sharedCart._id }, { $inc: { viewCount: 1 } }).catch(
      () => {},
    );

    res.json({ ok: true, items, viewCount: sharedCart.viewCount });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
