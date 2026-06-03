import express from "express";
import jwt from "jsonwebtoken";
import SSLCommerzPayment from "sslcommerz-lts";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import Discount from "../models/Discount.js";
import CouponUsage from "../models/CouponUsage.js";
import {
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
  sendPaymentConfirmedEmail,
} from "../lib/mailer.js";

const router = express.Router();

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
// Credentials are read lazily (inside each handler) so they are always
// resolved after dotenv has populated process.env, regardless of ESM
// module evaluation order.
const getSSLCreds = () => [process.env.STORE_ID, process.env.STORE_PASSWORD];
const is_live = process.env.NODE_ENV === "production";

// Dhaka city name variants (case-insensitive match)
const DHAKA_NAMES = ["dhaka", "ঢাকা"];
const isDhaka = (city) =>
  !!city && DHAKA_NAMES.some((d) => city.trim().toLowerCase() === d);

/**
 * Location-aware base shipping:
 *   - Free  when subtotal ≥ 999
 *   - 70 TK inside Dhaka
 *   - 130 TK outside Dhaka (or when city is unknown)
 */
const calcBaseShipping = (sub, city) => {
  if (sub >= 999) return 0;
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
// pricing breakdown. Supports multiple coupons (up to 3) if they are stackable.
// couponCodes can be a single code string or array of codes.
const resolveAndQuote = async (
  clientItems,
  couponCodes,
  resolvedUserId,
  city,
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

    let unitPrice =
      prod.variants?.length && prod.variants[0]?.price != null
        ? prod.variants[0].price
        : (prod.price ?? 0);
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
    });
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const baseShipping = calcBaseShipping(subtotal, city);

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

  // Limit to 3 coupons max
  codes = codes.slice(0, 3);

  // Process each coupon code
  for (const code of codes) {
    // Find coupon in database
    const coupon = await Discount.findOne({
      couponCode: { $regex: new RegExp(`^${code}$`, "i") },
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
  const total = Math.max(0, subtotal + shipping - discount);

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
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extracts the logged-in user's MongoDB _id from the JWT cookie, if present. */
const getUserId = (req) => {
  try {
    const token = req.cookies?.token;
    if (!token) return null;
    const payload = jwt.verify(token, process.env.JWT_SECRET || "secret");
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

    const payload = jwt.verify(token, process.env.JWT_SECRET || "secret");
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
    : (product.variants[0]?.price ?? product.price ?? null);
};

// ── POST /api/orders/quote ───────────────────────────────────────────────────
// Read-only price preview. No DB writes. The frontend calls this whenever cart
// contents change or a coupon is applied, and displays ONLY these server values.
router.post("/quote", async (req, res) => {
  try {
    const { items: clientItems, couponCode, couponCodes, city } = req.body;
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
    );
    res.json(quote);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── POST /api/orders ──────────────────────────────────────────────────────────
// Creates an order. Returns { ok, orderId, method } for COD or
// { ok, orderId, method, url } for online/bkash (SSLCommerz payment URL).
router.post("/", async (req, res) => {
  try {
    const {
      userEmail,
      items: clientItems,
      billingDetails,
      paymentMethod,
      couponCode,
      couponCodes,
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
    } = quote;

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
      status: "pending",
      paymentStatus: paymentMethod === "cash-on-delivery" ? "cod" : "unpaid",
      // COD orders auto-confirm 1 hour after placement; cancellable before this time
      confirmAfter:
        paymentMethod === "cash-on-delivery"
          ? new Date(Date.now() + 1 * 60 * 60 * 1000)
          : null,
    });

    await order.save();

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
    sendOrderConfirmationEmail(order).catch((err) =>
      console.error("Customer email failed:", err.message),
    );
    sendAdminOrderNotification(order).catch((err) =>
      console.error("Admin email failed:", err.message),
    );

    // ── Cash on Delivery ──────────────────────────────────────────────────
    if (paymentMethod === "cash-on-delivery") {
      return res.json({
        ok: true,
        orderId: order._id.toString(),
        method: "cod",
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
    console.error("Order creation error:", err);
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
          console.error(
            `[payment/success] Amount mismatch: paid=${paidAmt} expected=${order.total} id=${tran_id}`,
          );
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
        }).catch((e) =>
          console.error("Payment confirmed email failed:", e.message),
        );

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
    console.error("Payment success callback error:", err);
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
    console.error("Payment fail callback error:", err);
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
    console.error("Payment cancel callback error:", err);
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
            console.error(
              `[ipn] Amount mismatch: paid=${paidAmt} expected=${order.total} id=${tran_id}`,
            );
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
    console.error("IPN error:", err);
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
    console.error("POST /orders/:id/pay error:", err);
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

    res.json({ orders });
  } catch (err) {
    console.error("GET /orders/my error:", err);
    res.status(401).json({ error: "Invalid token" });
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

    res.json({ order });
  } catch (err) {
    console.error("GET /orders/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/orders/:id/cancel ─────────────────────────────────────────────
// Cancel a COD order within 30 minutes of creation.
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
        .json({ error: "The 30-minute cancellation window has passed." });
    }

    order.status = "cancelled";
    order.paymentStatus = "cancelled";
    order.updatedAt = new Date();
    await order.save();

    res.json({ ok: true, order });
  } catch (err) {
    console.error("PATCH /orders/:id/cancel error:", err);
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
        .json({ error: "The 30-minute edit window has passed." });
    }

    const { note, address, phone, billingDetails, items } = req.body || {};
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

      // Recalculate subtotal and total (keep shipping and discount)
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
    console.error("PATCH /orders/:id/edit error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
