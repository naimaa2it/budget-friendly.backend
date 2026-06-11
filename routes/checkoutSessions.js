import express from 'express';
import jwt from 'jsonwebtoken';
import CheckoutSession from '../models/CheckoutSession.js';

const router = express.Router();

// POST /api/checkout-sessions — record a checkout session start (no auth required)
router.post('/', async (req, res) => {
  try {
    const { items = [], total = 0 } = req.body;

    // Try to identify user from JWT cookie (works for logged-in users)
    let userId = null;
    try {
      const token = req.cookies?.token;
      if (token) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload?.id && payload?.type !== 'admin') userId = payload.id;
      }
    } catch (_) {}

    const session = await CheckoutSession.create({
      userId,
      items: (items || []).map((i) => ({
        productId: String(i.productId || ''),
        title: String(i.title || ''),
        image: i.image || null,
        price: Number(i.price || 0),
        quantity: Number(i.quantity || 1),
      })),
      total: Number(total || 0),
    });

    res.json({ ok: true, sessionId: session._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/checkout-sessions/:id — update guest identity as they fill the checkout form
router.patch('/:id', async (req, res) => {
  try {
    const { userName, userEmail, userPhone } = req.body;
    const update = {};
    if (userName) update.userName = String(userName).slice(0, 100);
    if (userEmail) update.userEmail = String(userEmail).slice(0, 200);
    if (userPhone) update.userPhone = String(userPhone).slice(0, 30);
    if (!Object.keys(update).length) return res.json({ ok: true });

    await CheckoutSession.findByIdAndUpdate(req.params.id, update);
    res.json({ ok: true });
  } catch (_) {
    res.json({ ok: true }); // silent — tracking is non-critical
  }
});

export default router;
