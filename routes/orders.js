import express from "express";
import jwt from "jsonwebtoken";
import { orderLimiter } from "../lib/rateLimiters.js";
import SSLCommerzPayment from "sslcommerz-lts";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import Discount from "../models/Discount.js";
import CouponUsage from "../models/CouponUsage.js";
import CheckoutSession from "../models/CheckoutSession.js";
import {
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
  sendPaymentConfirmedEmail,
} from "../lib/mailer.js";
import { syncOrderShipment } from "../lib/shipmentTracking.js";
import { getCourierLabelMap } from "../lib/courierDefaults.js";
import {
  findOrderByIdOrSuffix,
  findOrderByTrackingId,
  findOrderByTrackingUrl,
  formatOrderIdSuffix,
  toPublicTrackOrder,
} from "../lib/orderLookup.js";
import { applyOrderStatusChange } from "../lib/orderStatus.js";
import {
  POINTS_PER_TK,
  calcItemsRewardPoints,
  calcLineRewardPoints,
  deductUserRewardPoints,
  refundUserRewardPoints,
  creditOrderRewardPoints,
  resolveRedeemablePoints,
} from "../lib/rewards.js";

const router = express.Router();

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
// Credentials are read lazily (inside each handler) so they are always
// resolved after dotenv has populated process.env, regardless of ESM
// module evaluation order.
const getSSLCreds = () => [process.env.STORE_ID, process.env.STORE_PASSWORD];
const is_live = process.env.IS_LIVE === 'true';

// Dhaka city name variants (case-insensitive match)
const DHAKA_NAMES = ["dhaka", "ঢাকা"];
const isDhaka = (city) =>
  !!city && DHAKA_NAMES.some((d) => city.trim().toLowerCase() === d);

/**
 * Location-aware base shipping:
 *   - 70 TK inside Dhaka city
 *   - 130 TK for Savar and outside Dhaka
 *   - 0 when city is unknown (not yet selected)
 */
const calcBaseShipping = (sub, city) => {
  if (!city) return 0;
  return isDhaka(city) ? 70 : 130;
};

/**
 * Check if user is eligible for a coupon
 */
const checkCouponEligibility = async (coupon, userId, subtotal) => {
  // Check if coupon is active
  if (!coupon.isActive) {
    return { valid: false, error: "Coupon is not active." };
  }

  // Check if coupon is expired
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, error: "This coupon has expired." };
  }

  // Check minimum order amount
  if (coupon.minOrderAmount > 0 && subtotal < coupon.minOrderAmount) {
    return {
      valid: false,
      error: `Minimum order of ৳${coupon.minOrderAmount} required for coupon "${coupon.couponCode}".`,
    };
  }

  // Check total usage limit
  if (coupon.maxUsesTotal > 0 && coupon.usageCount >= coupon.maxUsesTotal) {
    return { valid: false, error: "This coupon has reached its usage limit." };
  }

  // User-specific checks
  if (userId) {
    const userDoc = await User.findById(userId).select("createdAt").lean();

    // Check new user requirement
    if (coupon.isNewUserOnly) {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const isNewUser =
        userDoc && new Date(userDoc.createdAt).getTime() > thirtyDaysAgo;
      if (!isNewUser) {
        return {
          valid: false,
          error: "This coupon is only valid for new users.",
        };
      }
    }

    // Check first order requirement
    if (coupon.isFirstOrderOnly) {
      const orderCount = await Order.countDocuments({
        userId,
        status: { $nin: ["cancelled", "failed"] },
      });
      if (orderCount > 0) {
        return {
          valid: false,
          error: "This coupon is only valid for your first order.",
        };
      }
    }

    // Check per-user usage limit
    if (coupon.maxUsesPerUser > 0) {
      const userUsageCount = await CouponUsage.countDocuments({
        userId,
        couponId: coupon._id,
      });
      if (userUsageCount >= coupon.maxUsesPerUser) {
        return {
          valid: false,
          error: `You have already used this coupon ${userUsageCount} time(s).`,
        };
      }
    }
  } else {
    // Guest users can't use user-specific coupons
    if (coupon.isNewUserOnly || coupon.isFirstOrderOnly) {
      return { valid: false, error: "Please login to use this coupon." };
    }
  }

  return { valid: true };
};

/**
 * Calculate discount value for a coupon
 */
const calculateCouponDiscount = (coupon, subtotal) => {
  if (coupon.discountType === "free_shipping") {
    return { type: "free_shipping", value: 0, givesFreeShipping: true };
  }

  if (coupon.discountType === "percentage") {
    let discount = (subtotal * coupon.discountValue) / 100;
    if (coupon.maxDiscountAmount > 0) {
      discount = Math.min(discount, coupon.maxDiscountAmount);
    }
    return { type: "percentage", value: discount, givesFreeShipping: false };
  }

  // fixed
  return {
    type: "fixed",
    value: coupon.discountValue,
    givesFreeShipping: false,
  };
};

// ── resolveAndQuote ───────────────────────────────────────────────────────────
// Shared helper used by both /quote (read-only preview) and POST / (order save).
// Fetches real prices from the DB, validates coupon(s), and returns the full
// pricing breakdown. Supports up to 2 stackable coupons (1 if cart has free-shipping product).
// couponCodes can be a single code string or array of codes.
const resolveAndQuote = async (
  clientItems,
  couponCodes,
  resolvedUserId,
  city,
  pointsToRedeem = 0,
) => {
  const productIds = clientItems.map((i) => i.productId).filter(Boolean);
  const dbProducts = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = Object.fromEntries(
    dbProducts.map((p) => [p._id.toString(), p]),
  );

  const items = [];
  for (const ci of clientItems) {
    const prod = productMap[ci.productId?.toString()];
    if (!prod) {
      const err = new Error(`Product not found: ${ci.productId}`);
      err.status = 400;
      throw err;
    }
    const qty = Math.max(1, parseInt(ci.quantity) || 1);

    let unitPrice = prod.price ?? 0;
    if (prod.variants?.length && (ci.color || ci.size)) {
      // Try new structure first (v.color.name, v.size)
      let variant = prod.variants.find((v) => {
        const variantColor = v.color?.name?.toLowerCase()?.trim();
        const variantSize = v.size?.toLowerCase()?.trim();
        const selectedColor = ci.color?.toLowerCase()?.trim();
        const selectedSize = ci.size?.toLowerCase()?.trim();

        const colorMatches =
          !variantColor || !selectedColor || variantColor === selectedColor;
        const sizeMatches =
          !variantSize || !selectedSize || variantSize === selectedSize;
        const hasMatch =
          (variantColor && selectedColor && variantColor === selectedColor) ||
          (variantSize && selectedSize && variantSize === selectedSize);

        return hasMatch && colorMatches && sizeMatches;
      });

      // Fallback to old structure (v.attributes.color, v.attributes.size)
      if (!variant) {
        variant = prod.variants.find((v) => {
          const variantColor = v.attributes?.color?.toLowerCase()?.trim();
          const variantSize = v.attributes?.size?.toLowerCase()?.trim();
          const selectedColor = ci.color?.toLowerCase()?.trim();
          const selectedSize = ci.size?.toLowerCase()?.trim();

          const colorMatches =
            !variantColor || !selectedColor || variantColor === selectedColor;
          const sizeMatches =
            !variantSize || !selectedSize || variantSize === selectedSize;
          const hasMatch =
            (variantColor && selectedColor && variantColor === selectedColor) ||
            (variantSize && selectedSize && variantSize === selectedSize);

          return hasMatch && colorMatches && sizeMatches;
        });
      }

      // Use variant price if available, otherwise fall back to base product price
      if (variant && variant.price != null && variant.price > 0) {
        unitPrice = variant.price;
      }
    }

    items.push({
      productId: prod._id,
      title: prod.title,
      price: unitPrice,
      quantity: qty,
      lineTotal: unitPrice * qty,
      image: prod.images?.[0]?.url || null,
      color: ci.color || null,
      size: ci.size || null,
      rewardPoints: Math.max(0, Number(prod.rewardPoints) || 0),
    });
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  // If any cart item has product-level free shipping, shipping is always 0
  const hasFreeShipping = items.some(
    (i) => productMap[i.productId.toString()]?.freeShipping === true,
  );
  const baseShipping = hasFreeShipping ? 0 : calcBaseShipping(subtotal, city);

  let totalCouponDiscount = 0;
  let couponGivesFreeShip = false;
  const appliedCoupons = [];
  const couponErrors = [];

  // Normalize couponCodes to array
  let codes = [];
  if (couponCodes) {
    if (Array.isArray(couponCodes)) {
      codes = couponCodes.map((c) => c?.trim().toUpperCase()).filter(Boolean);
    } else {
      codes = [couponCodes.trim().toUpperCase()];
    }
  }

  // If any product has free shipping, max 1 coupon; otherwise max 2
  codes = hasFreeShipping ? codes.slice(0, 1) : codes.slice(0, 2);

  // Process each coupon code
  for (const code of codes) {
    // Find coupon in database
    const coupon = await Discount.findOne({
      couponCode: code.toUpperCase(),
      isActive: true,
    }).lean();

    if (!coupon) {
      couponErrors.push({ code, error: "Invalid coupon code." });
      continue;
    }

    // Check eligibility
    const eligibility = await checkCouponEligibility(
      coupon,
      resolvedUserId,
      subtotal,
    );
    if (!eligibility.valid) {
      couponErrors.push({ code, error: eligibility.error });
      continue;
    }

    // Check stackability (only first coupon can be non-stackable, others must be stackable)
    if (appliedCoupons.length > 0 && !coupon.stackable) {
      couponErrors.push({
        code,
        error: "This coupon cannot be combined with others.",
      });
      continue;
    }
    if (appliedCoupons.length > 0 && appliedCoupons.some((c) => !c.stackable)) {
      couponErrors.push({
        code,
        error: "A non-stackable coupon is already applied.",
      });
      continue;
    }

    // Calculate discount
    const discountResult = calculateCouponDiscount(coupon, subtotal);

    if (discountResult.givesFreeShipping) {
      couponGivesFreeShip = true;
    } else {
      totalCouponDiscount += discountResult.value;
    }

    appliedCoupons.push({
      _id: coupon._id,
      code: coupon.couponCode,
      title: coupon.title,
      discountType: coupon.discountType,
      discountValue: discountResult.value,
      givesFreeShipping: discountResult.givesFreeShipping,
      stackable: coupon.stackable,
    });
  }

  // If only one code was provided and it failed, throw error for backwards compatibility
  if (
    codes.length === 1 &&
    couponErrors.length === 1 &&
    appliedCoupons.length === 0
  ) {
    const err = new Error(couponErrors[0].error);
    err.status = 400;
    throw err;
  }

  const shipping = couponGivesFreeShip ? 0 : baseShipping;
  const discount = totalCouponDiscount;
  const prePointsTotal = Math.max(0, subtotal + shipping - discount);
  const rewardPointsEarned = calcItemsRewardPoints(items);

  let availablePoints = 0;
  let pointsRedeemed = 0;
  let pointsDiscount = 0;

  if (resolvedUserId) {
    const userDoc = await User.findById(resolvedUserId)
      .select("rewardPointsBalance")
      .lean();
    availablePoints = userDoc?.rewardPointsBalance || 0;
    if (pointsToRedeem > 0) {
      const redeem = resolveRedeemablePoints(
        pointsToRedeem,
        availablePoints,
        prePointsTotal,
      );
      pointsRedeemed = redeem.pointsRedeemed;
      pointsDiscount = redeem.pointsDiscount;
    }
  }

  const total = Math.max(0, prePointsTotal - pointsDiscount);

  // Legacy fields for backwards compatibility (single coupon)
  const appliedCouponCode =
    appliedCoupons.length > 0 ? appliedCoupons[0].code : null;
  const couponHeadline =
    appliedCoupons.length > 0 ? appliedCoupons[0].title : null;

  return {
    items,
    subtotal,
    baseShipping,
    shipping,
    autoDiscount: 0, // No more auto discount - all discounts come from coupons
    couponDiscount: totalCouponDiscount,
    discount,
    total,
    freeShippingFromCoupon: couponGivesFreeShip,
    appliedCouponCode,
    couponHeadline,
    appliedCoupons,
    couponErrors,
    insideDhaka: isDhaka(city),
    rewardPointsEarned,
    availablePoints,
    pointsRedeemed,
    pointsDiscount,
    pointsPerTk: POINTS_PER_TK,
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extracts the logged-in user's MongoDB _id from the JWT cookie, if present. */
const getUserId = (req) => {
  try {
    const token = req.cookies?.token;
    if (!token) return null;
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.type === "admin" ? null : (payload.id?.toString() ?? null);
  } catch {
    return null;
  }
};

// Resolve requester identity for ownership checks and order-history lookups.
// We match by userId first, then by email to support legacy/guest-linked orders.
const getRequesterIdentity = async (req) => {
  try {
    const token = req.cookies?.token;
    if (!token) return null;

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const id = payload?.id ? payload.id.toString() : null;

    if (!id) return null;

    let email = null;
    if (payload.type === "admin") {
      const admin = await Admin.findById(id).select("email").lean();
      email = admin?.email ? String(admin.email).trim().toLowerCase() : null;
    } else {
      const user = await User.findById(id).select("email").lean();
      email = user?.email ? String(user.email).trim().toLowerCase() : null;
    }

    return { id, email, type: payload.type || "user" };
  } catch {
    return null;
  }
};

const ownsOrder = (order, identity) => {
  if (!order || !identity) return false;

  const ownerId = order.userId ? String(order.userId) : null;
  if (identity.id && ownerId && identity.id === ownerId) return true;

  const normalizedEmail = identity.email
    ? String(identity.email).trim().toLowerCase()
    : null;
  if (!normalizedEmail) return false;

  const orderEmail = order.userEmail
    ? String(order.userEmail).trim().toLowerCase()
    : null;
  const billingEmail = order.billingDetails?.email
    ? String(order.billingDetails.email).trim().toLowerCase()
    : null;

  return normalizedEmail === orderEmail || normalizedEmail === billingEmail;
};

const resolveVariantPrice = (product, color, size) => {
  if (!product) return null;

  const selectedColor = String(color || "")
    .trim()
    .toLowerCase();
  const selectedSize = String(size || "")
    .trim()
    .toLowerCase();

  if (!Array.isArray(product.variants) || !product.variants.length) {
    return product.price ?? null;
  }

  const matchedVariant = product.variants.find((variant) => {
    const variantColor = String(
      variant?.color?.name || variant?.attributes?.color || "",
    )
      .trim()
      .toLowerCase();
    const variantSize = String(variant?.size || variant?.attributes?.size || "")
      .trim()
      .toLowerCase();
    const colorMatches =
      !variantColor || !selectedColor || variantColor === selectedColor;
    const sizeMatches =
      !variantSize || !selectedSize || variantSize === selectedSize;
    const hasMatch =
      (variantColor && selectedColor && variantColor === selectedColor) ||
      (variantSize && selectedSize && variantSize === selectedSize);
    return hasMatch && colorMatches && sizeMatches;
  });

  return matchedVariant?.price != null
    ? matchedVariant.price
    : (product.price ?? null);
};

// ── POST /api/orders/quote ───────────────────────────────────────────────────
// Read-only price preview. No DB writes. The frontend calls this whenever cart
// contents change or a coupon is applied, and displays ONLY these server values.
router.post("/quote", async (req, res) => {
  try {
    const {
      items: clientItems,
      couponCode,
      couponCodes,
      city,
      pointsToRedeem,
    } = req.body;
    if (!Array.isArray(clientItems) || !clientItems.length) {
      return res.status(400).json({ error: "No items provided." });
    }
    const resolvedUserId = getUserId(req);
    // Support both single couponCode and array of couponCodes
    const codes = couponCodes || couponCode || null;
    const quote = await resolveAndQuote(
      clientItems,
      codes,
      resolvedUserId,
      city || null,
      pointsToRedeem || 0,
    );
    res.json(quote);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── POST /api/orders ──────────────────────────────────────────────────────────
// Creates an order. Returns { ok, orderId, method } for COD or
// { ok, orderId, method, url } for online/bkash (SSLCommerz payment URL).
router.post("/", orderLimiter, async (req, res) => {
  try {
    const {
      userEmail,
      items: clientItems,
      billingDetails,
      paymentMethod,
      couponCode,
      couponCodes,
      pointsToRedeem,
      deviceId,
    } = req.body;

    if (
      !Array.isArray(clientItems) ||
      !clientItems.length ||
      !billingDetails?.name ||
      !billingDetails?.phone ||
      !billingDetails?.city ||
      !billingDetails?.zone ||
      !billingDetails?.address
    ) {
      return res.status(400).json({ error: "Missing required order fields" });
    }

    // ── Fake Order Protection ─────────────────────────────────────────────────
    try {
      const Setting = (await import('../models/Setting.js')).default;
      const fop = (await Setting.findOne().lean())?.fakeOrderProtection;
      if (fop?.installed) {
        const clientIp =
          (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
          req.socket?.remoteAddress || '';
        const phone = billingDetails.phone?.replace(/\s+/g, '') || '';
        const now = new Date();

        // Sync blocklist checks first (no DB round-trips)
        if (fop.phoneOrder?.enabled && phone) {
          const phoneBlocklist = (fop.phoneOrder.blocklist || '').split(',').map(p => p.trim()).filter(Boolean);
          if (phoneBlocklist.includes(phone)) {
            return res.status(400).json({ error: 'এই নম্বর থেকে অর্ডার করা সম্ভব নয়।' });
          }
        }
        if (fop.ipOrder?.enabled && clientIp) {
          const ipBlocklist = (fop.ipOrder.blocklist || '').split(',').map(p => p.trim()).filter(Boolean);
          if (ipBlocklist.includes(clientIp)) {
            return res.status(400).json({ error: 'এই IP থেকে অর্ডার করা সম্ভব নয়।' });
          }
        }

        // Run all three rate-limit DB checks in parallel
        const mkSince = (dur, unit) => new Date(now - (unit === 'hours' ? dur * 3600000 : dur * 60000));
        const mkLabel = (dur, unit) => unit === 'hours' ? `${dur} ঘণ্টা` : `${dur} মিনিট`;

        const phonePromise = (fop.phoneOrder?.enabled && phone) ? (() => {
          const dur = Number(fop.phoneOrder.limitDuration) || 5;
          const unit = fop.phoneOrder.limitDurationUnit || 'minutes';
          return Order.countDocuments({ 'billingDetails.phone': phone, createdAt: { $gte: mkSince(dur, unit) } })
            .then(n => n > 0 ? `এই নম্বর থেকে ইতিমধ্যে একটি অর্ডার করা হয়েছে। অনুগ্রহ করে ${mkLabel(dur, unit)} পরে আবার চেষ্টা করুন।` : null);
        })() : Promise.resolve(null);

        const ipPromise = (fop.ipOrder?.enabled && clientIp) ? (() => {
          const dur = Number(fop.ipOrder.limitDuration) || 5;
          const unit = fop.ipOrder.limitDurationUnit || 'minutes';
          return Order.countDocuments({ clientIp, createdAt: { $gte: mkSince(dur, unit) } })
            .then(n => n > 0 ? `এই লোকেশন থেকে ইতিমধ্যে একটি অর্ডার করা হয়েছে। অনুগ্রহ করে ${mkLabel(dur, unit)} পরে আবার চেষ্টা করুন।` : null);
        })() : Promise.resolve(null);

        const devicePromise = (fop.deviceOrder?.enabled && deviceId) ? (() => {
          const dur = Number(fop.deviceOrder.limitDuration) || 5;
          const unit = fop.deviceOrder.limitDurationUnit || 'minutes';
          return Order.countDocuments({ deviceId, createdAt: { $gte: mkSince(dur, unit) } })
            .then(n => n > 0 ? `এই ডিভাইস থেকে ইতিমধ্যে একটি অর্ডার করা হয়েছে। অনুগ্রহ করে ${mkLabel(dur, unit)} পরে আবার চেষ্টা করুন।` : null);
        })() : Promise.resolve(null);

        const [phoneErr, ipErr, deviceErr] = await Promise.all([phonePromise, ipPromise, devicePromise]);
        if (phoneErr) return res.status(400).json({ error: phoneErr });
        if (ipErr) return res.status(400).json({ error: ipErr });
        if (deviceErr) return res.status(400).json({ error: deviceErr });
      }
    } catch (fopErr) {
      // don't block order on protection check failure
    }
    // ─────────────────────────────────────────────────────────────────────────

    // userId always comes from the JWT — the client value is never trusted
    const resolvedUserId = getUserId(req) || null;

    // All pricing is computed by the shared helper — no client figures trusted
    let quote;
    try {
      const orderCity = billingDetails?.city || null;
      const codes = couponCodes || couponCode || null;
      quote = await resolveAndQuote(
        clientItems,
        codes,
        resolvedUserId,
        orderCity,
        pointsToRedeem || 0,
      );
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const {
      items,
      subtotal,
      shipping,
      discount,
      total,
      appliedCouponCode,
      appliedCoupons,
      rewardPointsEarned,
      pointsRedeemed,
      pointsDiscount,
    } = quote;

    if (pointsRedeemed > 0 && !resolvedUserId) {
      return res.status(400).json({ error: "Login required to use reward points." });
    }

    const order = new Order({
      userId: resolvedUserId,
      userEmail: userEmail || null,
      items,
      billingDetails,
      subtotal,
      shipping,
      discount,
      total,
      paymentMethod,
      couponCode: appliedCouponCode,
      appliedCoupons:
        appliedCoupons?.map((c) => ({
          code: c.code,
          discountValue: c.discountValue,
        })) || [],
      rewardPointsEarned: rewardPointsEarned || 0,
      rewardPointsRedeemed: pointsRedeemed || 0,
      rewardPointsDiscount: pointsDiscount || 0,
      status: "pending",
      paymentStatus: ["cash-on-delivery", "bkash", "nagad", "rocket"].includes(paymentMethod) ? "cod" : "unpaid",
      clientIp: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '',
      deviceId: deviceId || '',
      // COD / manual mobile-banking orders auto-confirm 1 hour after placement
      confirmAfter:
        ["cash-on-delivery", "bkash", "nagad", "rocket"].includes(paymentMethod)
          ? new Date(Date.now() + 1 * 60 * 60 * 1000)
          : null,
    });

    await order.save();

    // Mark any open checkout sessions for this user as completed
    if (resolvedUserId) {
      CheckoutSession.updateMany(
        { userId: resolvedUserId, status: 'incomplete' },
        { status: 'completed', completedAt: new Date() },
      ).catch(() => {});
    }

    if (resolvedUserId && pointsRedeemed > 0) {
      await deductUserRewardPoints(resolvedUserId, pointsRedeemed);
    }

    // Track coupon usage
    if (resolvedUserId && appliedCoupons?.length > 0) {
      for (const coupon of appliedCoupons) {
        await CouponUsage.create({
          userId: resolvedUserId,
          couponId: coupon._id,
          orderId: order._id,
        });
        // Increment usage count on the discount
        await Discount.findByIdAndUpdate(coupon._id, {
          $inc: { usageCount: 1 },
        });
      }
    }

    // Send emails (non-blocking)
    sendOrderConfirmationEmail(order).catch(() => {});
    sendAdminOrderNotification(order).catch(() => {});

    // ── Cash on Delivery ──────────────────────────────────────────────────────
    if (paymentMethod === "cash-on-delivery") {
      return res.json({
        ok: true,
        orderId: order._id.toString(),
        method: "cod",
      });
    }

    // ── Manual Mobile Banking (bKash, Nagad, Rocket) ──────────────────────────
    if (["bkash", "nagad", "rocket"].includes(paymentMethod)) {
      const Setting = (await import('../models/Setting.js')).default;
      const settings = await Setting.findOne().lean();
      const cfg = settings?.mobileBanking?.[paymentMethod] || {};
      return res.json({
        ok: true,
        orderId: order._id.toString(),
        method: paymentMethod,
        merchantNumber: cfg.merchantNumber || '',
        amount: total,
      });
    }

    // ── Online → SSLCommerz ───────────────────────────────────────────────
    const [store_id, store_passwd] = getSSLCreds();
    if (!store_id || !store_passwd) {
      // Payment gateway not configured — fall back gracefully
      await Order.findByIdAndUpdate(order._id, {
        status: "failed",
        paymentStatus: "failed",
      });
      return res
        .status(503)
        .json({ error: "Payment gateway is not configured on the server." });
    }

    const tranId = order._id.toString();

    const sslData = {
      total_amount: total,
      tran_id: tranId,
      success_url: `${BACKEND_URL}/api/orders/payment/success`,
      fail_url: `${BACKEND_URL}/api/orders/payment/fail`,
      cancel_url: `${BACKEND_URL}/api/orders/payment/cancel`,
      ipn_url: `${BACKEND_URL}/api/orders/payment/ipn`,
      shipping_method: "Courier",
      product_name:
        items
          .map((i) => i.title)
          .join(", ")
          .slice(0, 255) || "YourHaat Order",
      product_category: "Mixed",
      product_profile: "general",
      num_of_item: items.reduce((s, i) => s + i.quantity, 0),
      cus_name: billingDetails.name,
      cus_email: billingDetails.email || userEmail || "customer@yourhaat.com",
      cus_add1: billingDetails.address || "N/A",
      cus_city: billingDetails.city || "Dhaka",
      cus_postcode: "1000",
      cus_country: "Bangladesh",
      cus_phone: billingDetails.phone,
      ship_name: billingDetails.name,
      ship_add1: billingDetails.address || "N/A",
      ship_city: billingDetails.city || "Dhaka",
      ship_postcode: "1000",
      ship_country: "Bangladesh",
    };

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const apiResponse = await sslcz.init(sslData);

    if (apiResponse?.GatewayPageURL) {
      order.transactionId = tranId;
      await order.save();
      return res.json({
        ok: true,
        orderId: tranId,
        method: "online",
        url: apiResponse.GatewayPageURL,
      });
    }

    // SSLCommerz init failed
    await Order.findByIdAndUpdate(order._id, {
      status: "failed",
      paymentStatus: "failed",
    });
    return res.status(502).json({
      error:
        apiResponse?.failedreason ||
        "Payment gateway initialisation failed. Please try again.",
    });
  } catch (err) {
    res.status(500).json({ error: "Server error placing order." });
  }
});

// ── SSLCommerz Callbacks ──────────────────────────────────────────────────────

// SSLCommerz POSTs here after successful card payment
router.post("/payment/success", async (req, res) => {
  try {
    const { tran_id, val_id, status, amount } = req.body;

    if (!tran_id)
      return res.redirect(`${FRONTEND_URL}/checkout/fail?reason=missing_id`);

    if (status === "VALID" || status === "VALIDATED") {
      const [store_id, store_passwd] = getSSLCreds();
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
      const validation = await sslcz.validate({ val_id });

      if (
        validation?.status === "VALID" ||
        validation?.status === "VALIDATED"
      ) {
        // ── Amount integrity check ──────────────────────────────────────────
        // Reject if paid amount differs from our stored order total by more than
        // ৳1 (SSLCommerz rounds to 2 decimal places, allowing minor float diff).
        const order = await Order.findById(tran_id);
        if (!order)
          return res.redirect(`${FRONTEND_URL}/checkout/fail?reason=not_found`);

        const paidAmt = parseFloat(validation.amount || amount || 0);
        if (Math.abs(paidAmt - order.total) > 1) {
            await Order.findByIdAndUpdate(tran_id, {
            status: "failed",
            paymentStatus: "failed",
            updatedAt: new Date(),
          });
          return res.redirect(
            `${FRONTEND_URL}/checkout/fail?orderId=${tran_id}&reason=amount_mismatch`,
          );
        }
        // ──────────────────────────────────────────────────────────────

        await Order.findByIdAndUpdate(tran_id, {
          status: "processing",
          paymentStatus: "paid",
          valId: val_id,
          paidAmount: paidAmt,
          updatedAt: new Date(),
        });

        // Send payment-confirmed email (non-blocking)
        sendPaymentConfirmedEmail({
          ...order.toObject(),
          paymentStatus: "paid",
          valId: val_id,
        }).catch(() => {});

        return res.redirect(
          `${FRONTEND_URL}/checkout/success?orderId=${tran_id}`,
        );
      }
    }

    // Validation failed
    await Order.findByIdAndUpdate(tran_id, {
      status: "failed",
      paymentStatus: "failed",
      updatedAt: new Date(),
    });
    return res.redirect(`${FRONTEND_URL}/checkout/fail?orderId=${tran_id}`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}/checkout/fail?reason=server_error`);
  }
});

// SSLCommerz POSTs here after failed payment
router.post("/payment/fail", async (req, res) => {
  try {
    const { tran_id } = req.body;
    if (tran_id) {
      await Order.findByIdAndUpdate(tran_id, {
        status: "failed",
        paymentStatus: "failed",
        updatedAt: new Date(),
      });
    }
    res.redirect(`${FRONTEND_URL}/checkout/fail?orderId=${tran_id || ""}`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}/checkout/fail`);
  }
});

// SSLCommerz POSTs here when user cancels payment (closed modal without paying)
// We keep the order alive as unpaid so the user can retry from their order history.
router.post("/payment/cancel", async (req, res) => {
  try {
    const { tran_id } = req.body;
    if (tran_id) {
      await Order.findByIdAndUpdate(tran_id, {
        status: "pending",
        paymentStatus: "unpaid",
        updatedAt: new Date(),
      });
    }
    res.redirect(`${FRONTEND_URL}/checkout/cancel?orderId=${tran_id || ""}`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}/checkout/cancel`);
  }
});

// Background IPN from SSLCommerz (server-to-server, no browser redirect needed)
router.post("/payment/ipn", async (req, res) => {
  try {
    const { tran_id, val_id, status, amount } = req.body;
    if ((status === "VALID" || status === "VALIDATED") && tran_id && val_id) {
      const [store_id, store_passwd] = getSSLCreds();
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
      const validation = await sslcz.validate({ val_id });
      if (
        validation?.status === "VALID" ||
        validation?.status === "VALIDATED"
      ) {
        const order = await Order.findById(tran_id);
        if (order && order.paymentStatus !== "paid") {
          const paidAmt = parseFloat(validation.amount || amount || 0);
          if (Math.abs(paidAmt - order.total) <= 1) {
            await Order.findByIdAndUpdate(tran_id, {
              status: "processing",
              paymentStatus: "paid",
              valId: val_id,
              paidAmount: paidAmt,
              updatedAt: new Date(),
            });
          } else {
            await Order.findByIdAndUpdate(tran_id, {
              status: "failed",
              paymentStatus: "failed",
              updatedAt: new Date(),
            });
          }
        }
      }
    }
    res.json({ received: true });
  } catch (err) {
    res.json({ received: true });
  }
});

// ── GET /api/orders/my ────────────────────────────────────────────────────────
// Returns orders for the currently logged-in user.

// ── POST /api/orders/:id/pay ─────────────────────────────────────────────────
// Re-initiate SSLCommerz for an existing unpaid/failed online order.
// Called from the fail/cancel pages so the user never has to re-fill the form.
router.post("/:id/pay", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found." });

    // Only the order owner can retry
    const identity = await getRequesterIdentity(req);
    if (!ownsOrder(order, identity)) {
      return res.status(403).json({ error: "Not your order." });
    }
    if (order.paymentMethod === "cash-on-delivery") {
      return res
        .status(400)
        .json({ error: "COD orders do not require online payment." });
    }
    if (order.paymentStatus === "paid") {
      return res
        .status(400)
        .json({ error: "This order has already been paid." });
    }
    if (!["unpaid", "failed"].includes(order.paymentStatus)) {
      return res
        .status(400)
        .json({ error: `Cannot retry for status "${order.paymentStatus}".` });
    }
    const [store_id, store_passwd] = getSSLCreds();
    if (!store_id || !store_passwd) {
      return res
        .status(503)
        .json({ error: "Payment gateway is not configured." });
    }

    // Reset to pending so callbacks can update it
    order.status = "pending";
    order.paymentStatus = "unpaid";
    order.updatedAt = new Date();
    await order.save();

    const tranId = order._id.toString();
    const billing = order.billingDetails || {};

    const sslData = {
      total_amount: order.total,
      tran_id: tranId,
      success_url: `${BACKEND_URL}/api/orders/payment/success`,
      fail_url: `${BACKEND_URL}/api/orders/payment/fail`,
      cancel_url: `${BACKEND_URL}/api/orders/payment/cancel`,
      ipn_url: `${BACKEND_URL}/api/orders/payment/ipn`,
      shipping_method: "Courier",
      product_name:
        (order.items || [])
          .map((i) => i.title)
          .join(", ")
          .slice(0, 255) || "YourHaat Order",
      product_category: "Mixed",
      product_profile: "general",
      num_of_item: (order.items || []).reduce((s, i) => s + i.quantity, 0),
      cus_name: billing.name || "Customer",
      cus_email: billing.email || order.userEmail || "customer@yourhaat.com",
      cus_add1: billing.address || "N/A",
      cus_city: billing.city || "Dhaka",
      cus_postcode: "1000",
      cus_country: "Bangladesh",
      cus_phone: billing.phone || "N/A",
      ship_name: billing.name || "Customer",
      ship_add1: billing.address || "N/A",
      ship_city: billing.city || "Dhaka",
      ship_postcode: "1000",
      ship_country: "Bangladesh",
    };

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const apiResponse = await sslcz.init(sslData);

    if (apiResponse?.GatewayPageURL) {
      order.transactionId = tranId;
      await order.save();
      return res.json({ ok: true, url: apiResponse.GatewayPageURL });
    }

    return res.status(502).json({
      error:
        apiResponse?.failedreason ||
        "Payment gateway failed. Please try again.",
    });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

//view own orders
router.get("/my", async (req, res) => {
  try {
    const identity = await getRequesterIdentity(req);
    if (!identity) return res.status(401).json({ error: "Not authenticated" });

    const ownerFilters = [];
    if (identity.id) ownerFilters.push({ userId: identity.id });
    if (identity.email) {
      ownerFilters.push({ userEmail: identity.email });
      ownerFilters.push({ "billingDetails.email": identity.email });
    }

    if (!ownerFilters.length) return res.json({ orders: [] });

    const orders = await Order.find({ $or: ownerFilters }).sort({
      createdAt: -1,
    });

    // Lazy auto-confirm: promote pending COD orders past their confirmAfter deadline
    const now = new Date();
    const toConfirm = orders.filter(
      (o) =>
        o.status === "pending" &&
        o.paymentMethod === "cash-on-delivery" &&
        o.confirmAfter &&
        o.confirmAfter <= now,
    );
    if (toConfirm.length) {
      await Order.updateMany(
        { _id: { $in: toConfirm.map((o) => o._id) } },
        { status: "confirmed", updatedAt: now },
      );
      toConfirm.forEach((o) => (o.status = "confirmed"));
    }

    // Lazy sync courier tracking from live URLs (max 5 per request)
    const toSync = orders
      .filter(
        (o) =>
          (o.shipment?.trackingId || o.shipment?.trackingUrl) &&
          !["delivered", "cancelled", "failed"].includes(o.status),
      )
      .slice(0, 5);

    await Promise.all(
      toSync.map(async (o) => {
        try {
          const result = await syncOrderShipment(o);
          if (result.order) {
            const idx = orders.findIndex(
              (row) => String(row._id) === String(result.order._id),
            );
            if (idx >= 0) orders[idx] = result.order;
          }
        } catch (err) {
        }
      }),
    );

    res.json({
      orders: orders.map((o) => {
        const obj = o.toObject ? o.toObject() : o;
        return { ...obj, orderId: formatOrderIdSuffix(o._id) };
      }),
    });
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// ── POST /api/orders/webhooks/steadfast — Steadfast tracking / delivery callbacks
router.post("/webhooks/steadfast", async (req, res) => {
  try {
    const bearer = process.env.STEADFAST_WEBHOOK_BEARER || process.env.STEADFAST_BEARER_TOKEN;
    if (bearer) {
      const auth = req.headers.authorization || "";
      if (auth !== `Bearer ${bearer}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const payload = req.body || {};
    const trackingCode =
      payload.tracking_code ||
      payload.trackingCode ||
      payload.tracking_id ||
      null;
    const consignmentId = payload.consignment_id || payload.consignmentId || null;
    const message =
      payload.tracking_message ||
      payload.status ||
      payload.message ||
      "Courier update";
    const atRaw = payload.updated_at || payload.updatedAt || new Date();

    const filters = [];
    if (trackingCode) filters.push({ "shipment.trackingId": String(trackingCode) });
    if (consignmentId) filters.push({ "shipment.trackingId": String(consignmentId) });

    if (!filters.length) {
      return res.status(400).json({ error: "tracking_code or consignment_id required" });
    }

    const order = await Order.findOne({ $or: filters });
    if (!order) {
      return res.status(404).json({ error: "Order not found for tracking reference." });
    }

    if (!order.shipment) order.shipment = { trackingEvents: [] };
    if (!order.shipment.courier) order.shipment.courier = "steadfast";

    const event = {
      status: payload.status_type || payload.notification_type || "update",
      message: String(message),
      at: new Date(atRaw),
      source: "courier",
    };

    const existing = order.shipment.trackingEvents || [];
    const dup = existing.some(
      (e) =>
        e.message === event.message &&
        Math.abs(new Date(e.at) - event.at) < 60000,
    );
    if (!dup) {
      order.shipment.trackingEvents = [...existing, event].sort(
        (a, b) => new Date(a.at) - new Date(b.at),
      );
    }

    order.shipment.courierStatus = String(message);
    order.shipment.lastSyncAt = new Date();

    const statusType = String(payload.status_type || "").toLowerCase();
    if (statusType.includes("deliver")) {
      order.status = "delivered";
      order.shipment.deliveredAt = event.at;
    } else if (statusType.includes("cancel")) {
      order.status = "cancelled";
    } else if (!["delivered", "cancelled", "failed"].includes(order.status)) {
      order.status = "shipped";
    }

    order.updatedAt = new Date();
    await order.save();

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

// ── POST /api/orders/webhooks/pathao — Pathao parcel status callback
router.post("/webhooks/pathao", async (req, res) => {
  try {
    const secret = process.env.PATHAO_WEBHOOK_SECRET;
    if (secret) {
      const incoming = req.headers["x-pathao-signature"] || req.headers["x-webhook-secret"];
      if (incoming !== secret) {
        return res.status(401).json({ error: "Invalid webhook signature." });
      }
    }

    const payload = req.body || {};
    const consignmentId =
      payload.consignment_id ||
      payload.consignmentId ||
      payload.tracking_id ||
      payload.trackingId;
    const courierStatus =
      payload.order_status ||
      payload.order_status_slug ||
      payload.status ||
      null;

    if (!consignmentId) {
      return res.status(400).json({ error: "consignment_id is required." });
    }

    const order = await Order.findOne({ "shipment.trackingId": String(consignmentId) });
    if (!order) {
      return res.status(404).json({ error: "Order not found for consignment." });
    }

    await syncOrderShipment(order, { force: true });
    if (courierStatus) {
      order.shipment.courierStatus = String(courierStatus);
      await order.save();
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

async function lazyConfirmCodOrder(order) {
  if (
    order.status === "pending" &&
    order.paymentMethod === "cash-on-delivery" &&
    order.confirmAfter &&
    order.confirmAfter <= new Date()
  ) {
    order.status = "confirmed";
    order.updatedAt = new Date();
    await order.save();
  }
}

// ── GET /api/orders/track — public lookup by order ID, tracking ID, or tracking URL
router.get("/track", async (req, res) => {
  try {
    const orderId = String(req.query.orderId || "").trim().replace(/^#/, "");
    const trackingId = String(req.query.trackingId || "").trim();
    const trackingUrl = String(req.query.trackingUrl || "").trim();

    if (!orderId && !trackingId && !trackingUrl) {
      return res.status(400).json({
        error: "Order ID, tracking ID, or tracking URL is required.",
      });
    }

    let order = null;
    if (orderId) {
      order = await findOrderByIdOrSuffix(orderId);
    } else if (trackingId) {
      order = await findOrderByTrackingId(trackingId);
    } else if (trackingUrl) {
      order = await findOrderByTrackingUrl(trackingUrl);
    }

    if (!order) {
      return res.status(404).json({
        error: "Order not found.",
        code: "order_not_found",
      });
    }

    await lazyConfirmCodOrder(order);

    try {
      const syncResult = await syncOrderShipment(order, { force: false });
      if (syncResult.ok && syncResult.order) {
        order = syncResult.order;
      }
    } catch (syncErr) {
    }

    const courierLabels = await getCourierLabelMap();
    const publicOrder = toPublicTrackOrder(order);

    res.json({
      order: publicOrder,
      courierLabels,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Lazy auto-confirm
    if (
      order.status === "pending" &&
      order.paymentMethod === "cash-on-delivery" &&
      order.confirmAfter &&
      order.confirmAfter <= new Date()
    ) {
      order.status = "confirmed";
      order.updatedAt = new Date();
      await order.save();
    }

    const identity = await getRequesterIdentity(req);
    const isAdmin = identity?.type === 'admin';
    const isOwner = ownsOrder(order, identity);

    if (isAdmin || isOwner) {
      return res.json({ order });
    }

    // Unauthenticated callers get non-PII confirmation data only.
    // This keeps the checkout success page working for guest orders
    // without exposing name / phone / address to strangers.
    const publicOrder = {
      _id: order._id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping,
      discount: order.discount,
      couponCode: order.couponCode,
      items: (order.items || []).map(i => ({ title: i.title, quantity: i.quantity, price: i.price })),
      createdAt: order.createdAt,
    };
    res.json({ order: publicOrder });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/orders/:id/cancel ─────────────────────────────────────────────
// Cancel a COD order within 1 hour of creation. Requires a reason (min 5 chars).
router.patch("/:id/cancel", async (req, res) => {
  try {
    const identity = await getRequesterIdentity(req);
    if (!identity) return res.status(401).json({ error: "Not authenticated" });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (!ownsOrder(order, identity))
      return res.status(403).json({ error: "Not your order" });

    if (order.paymentMethod !== "cash-on-delivery") {
      return res
        .status(400)
        .json({ error: "Only COD orders can be cancelled here." });
    }
    if (order.status !== "pending") {
      return res
        .status(400)
        .json({
          error: `Order is already ${order.status} and cannot be cancelled.`,
        });
    }
    if (order.confirmAfter && new Date() > order.confirmAfter) {
      return res
        .status(400)
        .json({ error: "The 1-hour cancellation window has passed." });
    }

    const reason = (req.body?.reason || "").trim();
    if (reason.length < 5) {
      return res.status(400).json({ error: "Please provide a cancellation reason (at least 5 characters)." });
    }

    applyOrderStatusChange(order, "cancelled", { reason, changedBy: "customer" });
    order.paymentStatus = "cancelled";
    order.updatedAt = new Date();
    await order.save();

    if (order.userId && order.rewardPointsRedeemed > 0) {
      await refundUserRewardPoints(order.userId, order.rewardPointsRedeemed);
    }

    res.json({ ok: true, order });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/orders/:id/edit ────────────────────────────────────────────────
// Edit the delivery note / address of a pending COD order within 30 minutes.
router.patch("/:id/edit", async (req, res) => {
  try {
    const identity = await getRequesterIdentity(req);
    if (!identity) return res.status(401).json({ error: "Not authenticated" });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (!ownsOrder(order, identity))
      return res.status(403).json({ error: "Not your order" });

    if (order.status !== "pending") {
      return res
        .status(400)
        .json({
          error: `Order is already ${order.status} and cannot be edited.`,
        });
    }
    if (order.confirmAfter && new Date() > order.confirmAfter) {
      return res
        .status(400)
        .json({ error: "The 1-hour edit window has passed." });
    }

    const { note, address, phone, billingDetails, items, addItems } = req.body || {};
    const billingPatch =
      billingDetails && typeof billingDetails === "object"
        ? billingDetails
        : {};
    const billingUpdates = {
      ...(typeof note !== "undefined" ? { note } : {}),
      ...(typeof address !== "undefined" ? { address } : {}),
      ...(typeof phone !== "undefined" ? { phone } : {}),
      ...billingPatch,
    };

    Object.entries(billingUpdates).forEach(([key, value]) => {
      if (typeof value !== "undefined") {
        order.billingDetails[key] = value;
      }
    });

    // Update item quantities if provided
    if (Array.isArray(items) && items.length > 0) {
      for (const itemUpdate of items) {
        const explicitIndex = Number.isInteger(itemUpdate?.index)
          ? itemUpdate.index
          : -1;
        const productId = itemUpdate?.productId;
        const idx =
          explicitIndex >= 0 && explicitIndex < order.items.length
            ? explicitIndex
            : order.items.findIndex(
                (it) => it.productId?.toString() === productId?.toString(),
              );

        if (idx === -1) continue;

        const currentItem = order.items[idx];
        const nextColor =
          typeof itemUpdate.color !== "undefined"
            ? itemUpdate.color
            : currentItem.color;
        const nextSize =
          typeof itemUpdate.size !== "undefined"
            ? itemUpdate.size
            : currentItem.size;
        const nextQuantity = Number(itemUpdate.quantity);

        if (Number.isFinite(nextQuantity) && nextQuantity >= 1) {
          currentItem.quantity = nextQuantity;
        }

        if (typeof itemUpdate.color !== "undefined") {
          currentItem.color = itemUpdate.color || null;
        }
        if (typeof itemUpdate.size !== "undefined") {
          currentItem.size = itemUpdate.size || null;
        }

        if (productId) {
          const product = await Product.findById(productId).lean();
          if (product) {
            const resolvedPrice = resolveVariantPrice(
              product,
              nextColor,
              nextSize,
            );
            if (resolvedPrice != null) {
              currentItem.price = resolvedPrice;
            }
          }
        }
      }

    }

    // Add new products to the order
    if (Array.isArray(addItems) && addItems.length > 0) {
      for (const ni of addItems) {
        if (!ni.productId) continue;
        const prod = await Product.findById(ni.productId).lean();
        if (!prod) continue;
        const qty = Math.max(1, parseInt(ni.quantity) || 1);
        const price = resolveVariantPrice(prod, ni.color, ni.size) ?? prod.price ?? 0;
        order.items.push({
          productId: prod._id,
          title: prod.title,
          price,
          quantity: qty,
          image: prod.images?.[0]?.url || null,
          color: ni.color || null,
          size: ni.size || null,
          rewardPoints: Math.max(0, Number(prod.rewardPoints) || 0),
        });
      }
    }

    // Recalculate totals whenever items changed
    if ((Array.isArray(items) && items.length > 0) || (Array.isArray(addItems) && addItems.length > 0)) {
      const newSubtotal = order.items.reduce(
        (sum, it) => sum + (it.price || 0) * it.quantity,
        0,
      );
      order.subtotal = newSubtotal;
      order.total = newSubtotal + (order.shipping || 0) - (order.discount || 0);
    }

    order.markModified("items");
    order.markModified("billingDetails");
    order.updatedAt = new Date();
    await order.save();

    res.json({ ok: true, order });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Switch mobile-banking order to Cash on Delivery ──────────────────────────
// Called when customer cancels on the payment page and chooses COD instead
router.patch("/:id/switch-to-cod", async (req, res) => {
  try {
    const identity = await getRequesterIdentity(req);
    if (!identity) return res.status(401).json({ error: "Not authenticated." });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found." });

    if (!ownsOrder(order, identity) && identity.type !== 'admin') {
      return res.status(403).json({ error: "Not your order." });
    }
    if (!["bkash", "nagad", "rocket"].includes(order.paymentMethod)) {
      return res.status(400).json({ error: "Order is not a mobile-banking order." });
    }
    if (order.status !== "pending") {
      return res.status(400).json({ error: "Only pending orders can be switched." });
    }
    order.paymentMethod = "cash-on-delivery";
    order.paymentStatus = "cod";
    order.paymentNote = "Switched to COD by customer on payment page.";
    order.confirmAfter = new Date(Date.now() + 1 * 60 * 60 * 1000);
    await order.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// ── Submit mobile-banking transaction ID ──────────────────────────────────────
// Called from /checkout/payment page after customer sends money
router.patch("/:id/mobile-payment", async (req, res) => {
  try {
    const identity = await getRequesterIdentity(req);
    if (!identity) return res.status(401).json({ error: "Not authenticated." });

    const { senderNumber, transactionId } = req.body || {};
    if (!transactionId?.trim()) {
      return res.status(400).json({ error: "Transaction ID is required." });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found." });

    if (!ownsOrder(order, identity) && identity.type !== 'admin') {
      return res.status(403).json({ error: "Not your order." });
    }
    if (!["bkash", "nagad", "rocket"].includes(order.paymentMethod)) {
      return res.status(400).json({ error: "Not a mobile-banking order." });
    }
    order.paymentNote = `TxID: ${transactionId.trim()}${senderNumber ? ` | Sender: ${senderNumber.trim()}` : ''}`;
    order.paymentStatus = "pending_verification";
    await order.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

export default router;
