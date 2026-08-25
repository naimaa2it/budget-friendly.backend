// Places a confirmed Cash-on-Delivery order on behalf of the support chatbot.
//
// Reuses the same pricing engine as the storefront checkout (resolveAndQuote)
// so shipping, totals and reward points are computed identically. The order is
// saved as "confirmed" (the customer already agreed in chat) and the customer
// gets the order-confirmed email.

import Order from "../models/Order.js";
import { resolveAndQuote } from "../routes/orders.js";
import {
  sendOrderConfirmedEmail,
  sendAdminOrderNotification,
} from "../lib/mailer.js";
import { validateBdAddress, isValidBdPhone, normalizeBdPhone } from "./bdValidation.js";

// items: [{ productId, quantity, color?, size? }]
// customer: { name, phone, email, city, zone, area, address, note? }
export async function placeChatbotOrder({ items, customer, meta = {} }) {
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

  const billingDetails = {
    name: String(customer.name).trim(),
    phone,
    email: customer.email ? String(customer.email).trim() : "",
    city: addr.normalized.city,
    zone: addr.normalized.zone || "",
    area: addr.normalized.area || "",
    address: String(customer.address).trim(),
    note: customer.note ? String(customer.note).trim() : "Chatbot order",
  };

  const order = new Order({
    userId: null,
    userEmail: billingDetails.email || null,
    items: quote.items,
    billingDetails,
    subtotal: quote.subtotal,
    shipping: quote.shipping,
    discount: quote.discount || 0,
    total: quote.total,
    paymentMethod: "cash-on-delivery",
    status: "confirmed",
    paymentStatus: "cod",
    source: "chatbot",
    rewardPointsEarned: quote.rewardPointsEarned || 0,
    statusHistory: [
      {
        previousStatus: null,
        newStatus: "confirmed",
        reason: "Placed & confirmed via support chatbot",
        changedBy: "chatbot",
        at: new Date(),
      },
    ],
    clientIp: meta.clientIp || "",
    deviceId: meta.deviceId || "",
    userAgent: meta.userAgent || "chatbot",
    confirmAfter: null,
  });

  await order.save();

  // Fire-and-forget emails (VPS is always-on; don't block the chat reply)
  if (billingDetails.email) sendOrderConfirmedEmail(order).catch(() => {});
  sendAdminOrderNotification(order).catch(() => {});

  return {
    ok: true,
    orderId: order._id.toString(),
    orderIdSuffix: order._id.toString().slice(-8).toUpperCase(),
    total: quote.total,
    shipping: quote.shipping,
    subtotal: quote.subtotal,
    items: quote.items.map((i) => ({
      title: i.title,
      quantity: i.quantity,
      price: i.price,
    })),
    emailSent: !!billingDetails.email,
  };
}
