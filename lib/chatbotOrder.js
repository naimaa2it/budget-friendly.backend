// Places a confirmed Cash-on-Delivery order on behalf of the support chatbot.
//
// Reuses the same pricing engine as the storefront checkout (resolveAndQuote)
// so shipping, totals and reward points are computed identically. The order is
// saved as "confirmed" (the customer already agreed in chat) and the customer
// gets the order-confirmed email.

import Order from "../models/Order.js";
import { getNextOrderNo } from "../models/Counter.js";
import { formatOrderNumber } from "./orderLookup.js";
import { resolveAndQuote } from "../routes/orders.js";
import {
  sendOrderConfirmationEmail,
  sendOrderConfirmedEmail,
  sendAdminOrderNotification,
} from "../lib/mailer.js";
import { validateBdAddress, isValidBdPhone, normalizeBdPhone } from "./bdValidation.js";

// items: [{ productId, quantity, color?, size? }]
// customer: { name, phone, email, city, zone, area, address, note? }
// options:
//   source       — order.source tag (default "chatbot"; "manual" for admin-placed)
//   changedBy     — who to record in statusHistory (default "chatbot")
//   statusReason  — reason line stored in statusHistory
//   defaultNote   — billing note when customer.note is empty
//   userId        — link the order to a customer account (order history + rewards)
//   requireAddress— when false, the full street address is optional
//   shippingOverride — when a number, use this delivery charge instead of the
//                      auto-computed one (staff can edit it on a manual order)
export async function placeChatbotOrder({
  items,
  customer,
  meta = {},
  source = "chatbot",
  changedBy = "chatbot",
  statusReason = "Placed & confirmed via support chatbot",
  defaultNote = "Chatbot order",
  userId = null,
  requireAddress = true,
  shippingOverride = null,
  // Order status to open with. "confirmed" (default) is used by staff-placed
  // manual orders (customer already verified by phone). The support chatbot
  // passes "pending" so, like a normal COD checkout, it waits for confirmation
  // (auto-confirms 1h later) instead of jumping straight to confirmed.
  status = "confirmed",
} = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "কোনো পণ্য সিলেক্ট করা হয়নি।" };
  }
  if (!customer?.name || String(customer.name).trim().length < 2) {
    return { ok: false, error: "কাস্টমারের নাম দিন।" };
  }
  if (!isValidBdPhone(customer.phone)) {
    return {
      ok: false,
      error:
        "ফোন নাম্বারটা ঠিক নেই। একটা সঠিক বাংলাদেশি মোবাইল নাম্বার দিন (যেমন 01712345678)।",
    };
  }

  const addr = validateBdAddress({
    city: customer.city,
    zone: customer.zone,
    area: customer.area,
    address: customer.address,
    requireAddress,
  });
  if (!addr.ok) {
    return { ok: false, error: addr.errors.join(" ") };
  }

  const phone = normalizeBdPhone(customer.phone);

  let quote;
  try {
    quote = await resolveAndQuote(
      items,
      null,
      null,
      addr.normalized.city,
      0,
      addr.normalized.zone || null,
      addr.normalized.area || null,
    );
  } catch (err) {
    return { ok: false, error: err.message || "Product/price resolve korte problem holo." };
  }

  // Staff can override the delivery charge on a manual order. Recompute the
  // total from the overridden shipping (no coupons/points on manual orders, so
  // total = subtotal + shipping − discount).
  const shipping =
    shippingOverride != null && !Number.isNaN(Number(shippingOverride))
      ? Math.max(0, Number(shippingOverride))
      : quote.shipping;
  const total = quote.subtotal + shipping - (quote.discount || 0);

  const billingDetails = {
    name: String(customer.name).trim(),
    phone,
    email: customer.email ? String(customer.email).trim() : "",
    city: addr.normalized.city,
    zone: addr.normalized.zone || "",
    area: addr.normalized.area || "",
    address: customer.address ? String(customer.address).trim() : "",
    note: customer.note ? String(customer.note).trim() : defaultNote,
  };

  const openStatus = status === "pending" ? "pending" : "confirmed";
  const isPending = openStatus === "pending";

  const order = new Order({
    orderNo: await getNextOrderNo(),
    userId: userId || null,
    userEmail: billingDetails.email || null,
    items: quote.items,
    billingDetails,
    subtotal: quote.subtotal,
    shipping,
    discount: quote.discount || 0,
    total,
    paymentMethod: "cash-on-delivery",
    status: openStatus,
    paymentStatus: "cod",
    source,
    rewardPointsEarned: quote.rewardPointsEarned || 0,
    statusHistory: [
      {
        previousStatus: null,
        newStatus: openStatus,
        reason: statusReason,
        changedBy,
        at: new Date(),
      },
    ],
    clientIp: meta.clientIp || "",
    deviceId: meta.deviceId || "",
    userAgent: meta.userAgent || source,
    // Pending COD orders auto-confirm 1h after placement (same as storefront
    // checkout); a confirmed order needs no deadline.
    confirmAfter: isPending ? new Date(Date.now() + 1 * 60 * 60 * 1000) : null,
  });

  await order.save();

  // Fire-and-forget emails (VPS is always-on; don't block the chat reply).
  // Pending → "order received" email now; the "confirmed" email fires later
  // when it auto-confirms. Confirmed → send the confirmed email straight away.
  if (billingDetails.email) {
    (isPending ? sendOrderConfirmationEmail(order) : sendOrderConfirmedEmail(order)).catch(
      () => {},
    );
  }
  sendAdminOrderNotification(order).catch(() => {});

  return {
    ok: true,
    orderId: order._id.toString(),
    orderNo: order.orderNo,
    // Human-facing number shown in the chat reply ("pk100000").
    orderIdSuffix: formatOrderNumber(order),
    total,
    shipping,
    subtotal: quote.subtotal,
    items: quote.items.map((i) => ({
      title: i.title,
      quantity: i.quantity,
      price: i.price,
    })),
    emailSent: !!billingDetails.email,
  };
}
