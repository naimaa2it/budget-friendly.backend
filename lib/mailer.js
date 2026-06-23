import nodemailer from "nodemailer";

const ORDER_EMAIL = process.env.ORDER_SMTP_USER || "";
const SUPPORT_EMAIL = process.env.SUPPORT_SMTP_USER || "";
const STORE_EMAIL = process.env.STORE_EMAIL || ORDER_EMAIL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ORDER_EMAIL;
const STORE_PHONE = process.env.STORE_PHONE || "";
const FRONTEND_URL = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

let _storeNameCache = null;
let _storeNameCacheTime = 0;
async function getStoreName() {
  const now = Date.now();
  if (_storeNameCache && now - _storeNameCacheTime < 60000)
    return _storeNameCache;
  try {
    const Setting = (await import("../models/Setting.js")).default;
    const s = await Setting.findOne().lean();
    _storeNameCache = s?.storeName || process.env.STORE_NAME || "Pickob";
  } catch {
    _storeNameCache = process.env.STORE_NAME || "Pickob";
  }
  _storeNameCacheTime = Date.now();
  return _storeNameCache;
}

function makeTransporter(user, pass) {
  if (!process.env.SMTP_HOST || !user || !pass) {
    console.warn(
      `[mailer] SMTP not configured — host=${process.env.SMTP_HOST} user=${user}`,
    );
    return null;
  }
  const port = Number(process.env.SMTP_PORT) || 465;
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    socketTimeout: 10000,
    greetingTimeout: 8000,
  });
  // Verify connection on startup so errors are visible immediately
  t.verify()
    .then(() => {
      console.log(
        `[mailer] SMTP OK: ${user} → ${process.env.SMTP_HOST}:${port}`,
      );
    })
    .catch((err) => {
      console.error(`[mailer] SMTP FAILED for ${user}: ${err.message}`);
    });
  return t;
}

// Eagerly create both transporters so verify() runs on server start
const _orderTransporter = makeTransporter(
  process.env.ORDER_SMTP_USER,
  process.env.ORDER_SMTP_PASS,
);
const _supportTransporter = makeTransporter(
  process.env.SUPPORT_SMTP_USER,
  process.env.SUPPORT_SMTP_PASS,
);

const getOrderTransporter = () => _orderTransporter;
const getSupportTransporter = () => _supportTransporter;

const shortId = (id) => String(id).slice(-6).toUpperCase();

const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

// ─── Customer Confirmation Email ──────────────────────────────────────────────
const customerEmailHtml = (order, STORE_NAME) => {
  const billing = order.billingDetails || {};
  const addr = [billing.address, billing.zone, billing.city]
    .filter(Boolean)
    .join(", ");
  const orderNum = shortId(order._id);
  const itemRows = (order.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="56">
                ${item.image ? `<img src="${item.image}" width="48" height="48" style="border-radius:6px;object-fit:cover;" />` : ""}
              </td>
              <td style="padding-left:10px;">
                <div style="font-size:13px;color:#333;">${item.title}</div>
                ${item.color || item.size ? `<div style="font-size:11px;color:#888;margin-bottom:2px;">${[item.color, item.size].filter(Boolean).join(" / ")}</div>` : ""}
                <div style="font-size:12px;color:#888;">৳${item.price?.toFixed(2)} × ${item.quantity}</div>
              </td>
              <td align="right" style="font-size:14px;font-weight:600;color:#333;">
                ৳${((item.price || 0) * item.quantity).toFixed(2)}
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:30px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

      <!-- Header -->
      <tr><td style="background:#1a1a2e;padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">🛍 ${STORE_NAME}</h1>
      </td></tr>

      <!-- Greeting -->
      <tr><td style="padding:32px 32px 0;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">Thanks for your Order!</h2>
        <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
          Hi <strong>${billing.name || "Valued Customer"}</strong>, we&apos;re getting your order ready to be shipped.
          We will notify you when it has been sent.
          ${
            order.paymentMethod === "cash-on-delivery"
              ? "Your Cash on Delivery order will be confirmed after 10 minutes."
              : "Once <strong>Payment</strong> is complete we&apos;ll start processing your order."
          }
        </p>
      </td></tr>

      <!-- Order card -->
      <tr><td style="padding:24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;padding:16px;">
          <tr>
            <td style="font-size:12px;color:#888;">${formatDate(order.createdAt)}</td>
            <td align="right">
              <span style="background:#fff3cd;color:#856404;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:600;">
                ${order.status.toUpperCase()}
              </span>
            </td>
          </tr>
          <tr><td colspan="2" style="padding-top:6px;">
            <strong style="font-size:16px;color:#1a1a2e;">Order #${orderNum}</strong>
          </td></tr>
          <tr><td colspan="2" style="padding-top:6px;border-top:2px dashed #e0e0e0;margin-top:8px;">
            &nbsp;
          </td></tr>
          <tr><td colspan="2">
            <span style="color:${order.paymentStatus === "paid" ? "#198754" : "#dc3545"};font-size:13px;font-weight:600;">
              ${order.paymentStatus}
            </span>
          </td></tr>
        </table>
      </td></tr>

      <!-- Savings banner -->
      ${
        order.discount > 0
          ? `
      <tr><td style="padding:0 32px 16px;">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 18px;text-align:center;">
          <span style="font-size:15px;font-weight:700;color:#15803d;">You are saving ৳${(order.discount || 0).toFixed(2)} on this order!</span>
        </div>
      </td></tr>`
          : ""
      }

      <!-- Order Summary -->
      <tr><td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:14px 18px;background:#fafafa;border-bottom:1px solid #f0f0f0;">
            <strong style="font-size:15px;color:#1a1a2e;">Order Summary</strong>
          </td></tr>
          <tr><td style="padding:12px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#555;">
              <tr>
                <td style="padding:4px 0;">Subtotal</td>
                <td align="right" style="color:#333;font-weight:600;">৳${(order.subtotal || 0).toFixed(2)}</td>
              </tr>
              ${
                order.couponCode && order.discount > 0
                  ? `
              <tr>
                <td style="padding:4px 0;color:#15803d;">Coupon Discount (${order.couponCode})</td>
                <td align="right" style="color:#15803d;font-weight:600;">-৳${(order.discount || 0).toFixed(2)}</td>
              </tr>`
                  : order.discount > 0
                    ? `
              <tr>
                <td style="padding:4px 0;">Discount</td>
                <td align="right" style="color:#333;font-weight:600;">-৳${(order.discount || 0).toFixed(2)}</td>
              </tr>`
                    : ""
              }
              <tr>
                <td style="padding:4px 0;">Shipping</td>
                <td align="right" style="color:#333;font-weight:600;">৳${(order.shipping || 0).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;">Paid</td>
                <td align="right" style="color:#333;font-weight:600;">${order.paidAmount != null ? "৳" + order.paidAmount.toFixed(2) : "0"}</td>
              </tr>
            </table>
            <div style="border-top:2px dashed #e0e0e0;margin:10px 0;"></div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#dc3545;font-weight:600;">Due</td>
                <td align="right" style="font-size:15px;color:#dc3545;font-weight:700;">৳${(order.total || 0).toFixed(2)}</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <!-- Product Summary -->
      <tr><td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:14px 18px;background:#fafafa;border-bottom:1px solid #f0f0f0;">
            <strong style="font-size:15px;color:#1a1a2e;">Product Summary</strong>
          </td></tr>
          <tr><td style="padding:4px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
          </td></tr>
        </table>
      </td></tr>

      <!-- Customer Info -->
      <tr><td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:14px 18px;background:#fafafa;border-bottom:1px solid #f0f0f0;">
            <strong style="font-size:15px;color:#1a1a2e;">Customer Info</strong>
          </td></tr>
          <tr><td style="padding:16px 18px;font-size:13px;color:#555;line-height:1.8;">
            <strong style="color:#333;">Shipping Address</strong><br/>
            ${addr || "N/A"}<br/><br/>
            <strong style="color:#333;">Billing Address</strong><br/>
            ${addr || "N/A"}<br/><br/>
            <strong style="color:#333;">Shipping Method</strong><br/>
            ${billing.city === "Dhaka" || billing.city === "ঢাকা" ? "Inside Dhaka Delivery" : "Outside Delivery"}
          </td></tr>
        </table>
      </td></tr>

      <!-- Policy note -->
      <tr><td style="padding:0 32px 16px;font-size:12px;color:#777;line-height:1.7;">
        This order is subscribed to ${STORE_NAME}. Check your order and delivery details.<br/><br/>
        Order will be delivered within 24 to 72 hours after confirmation. This email doesn&apos;t confirm your order yet.
        You will receive another processing email once we have accepted your order.
        ${STORE_NAME} may, in its sole discretion, choose to accept or decline your order for any reason.
      </td></tr>

      <!-- View Order Button -->
      <tr><td style="padding:0 32px 24px;text-align:center;">
        <a href="${FRONTEND_URL}/user/orders" style="display:inline-block;background:#e91e63;color:#fff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:700;">
          View My Orders
        </a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:20px 32px;background:#f9f9f9;border-top:1px solid #f0f0f0;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;color:#888;">
          Email: <a href="mailto:${ORDER_EMAIL}" style="color:#1a1a2e;">${ORDER_EMAIL}</a>
          ${STORE_PHONE ? ' | Phone: <span style="color:#1a1a2e;">' + STORE_PHONE + "</span>" : ""}
        </p>
        <p style="margin:0;font-size:11px;color:#aaa;">You are receiving this email because you placed an order on our website.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
};

// ─── Admin Notification Email ─────────────────────────────────────────────────
const adminEmailHtml = (order, STORE_NAME) => {
  const billing = order.billingDetails || {};
  const orderNum = shortId(order._id);
  const itemList = (order.items || [])
    .map(
      (i) =>
        `<li style="margin-bottom:4px;">${i.title} × ${i.quantity} — ৳${((i.price || 0) * i.quantity).toFixed(2)}</li>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  <h2 style="color:#1a1a2e;margin-top:0;">🛒 New Order Received — #${orderNum}</h2>
  <p style="color:#555;">A new ${order.paymentMethod} order has been placed on <strong>${STORE_NAME}</strong>.</p>

  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#333;margin-bottom:24px;">
    <tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><strong>Order ID</strong></td><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">#${orderNum}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><strong>Customer</strong></td><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${billing.name || "N/A"}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><strong>Phone</strong></td><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${billing.phone || "N/A"}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><strong>Email</strong></td><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${billing.email || order.userEmail || "N/A"}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><strong>Address</strong></td><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${[billing.address, billing.zone, billing.city].filter(Boolean).join(", ") || "N/A"}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><strong>Payment</strong></td><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${order.paymentMethod}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;"><strong>Total</strong></td><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-weight:700;color:#dc3545;">৳${(order.total || 0).toFixed(2)}</td></tr>
    <tr><td style="padding:6px 0;"><strong>Note</strong></td><td style="padding:6px 0;">${billing.note || "—"}</td></tr>
  </table>

  <h3 style="color:#1a1a2e;margin-bottom:10px;">Items</h3>
  <ul style="color:#555;font-size:13px;padding-left:18px;">${itemList}</ul>

  <div style="margin-top:24px;text-align:center;">
    <a href="${FRONTEND_URL}/dashboard/orders" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:700;">
      Manage Orders
    </a>
  </div>
</div>
</body>
</html>`;
};

// ─── Public send helpers ──────────────────────────────────────────────────────

export async function sendOrderConfirmationEmail(order) {
  const transporter = getOrderTransporter();
  if (!transporter) return;
  const toEmail = order.billingDetails?.email || order.userEmail;
  if (!toEmail) {
    console.warn(
      `[mailer] sendOrderConfirmationEmail skipped — no email on order ${order._id}`,
    );
    return;
  }
  const STORE_NAME = await getStoreName();
  try {
    await transporter.sendMail({
      from: `"${STORE_NAME}" <${ORDER_EMAIL}>`,
      to: toEmail,
      bcc: ORDER_EMAIL,
      subject: `Order Confirmed — #${shortId(order._id)} | ${STORE_NAME}`,
      html: customerEmailHtml(order, STORE_NAME),
    });
    console.log(`[mailer] Order confirmation sent → ${toEmail}`);
  } catch (err) {
    console.error(`[mailer] sendOrderConfirmationEmail failed:`, err.message);
  }
}

export async function sendAdminOrderNotification(order) {
  const transporter = getOrderTransporter();
  if (!transporter || !ADMIN_EMAIL) return;
  const STORE_NAME = await getStoreName();
  try {
    await transporter.sendMail({
      from: `"${STORE_NAME} Orders" <${ORDER_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: `New Order #${shortId(order._id)} — ৳${(order.total || 0).toFixed(2)} | ${order.paymentMethod}`,
      html: adminEmailHtml(order, STORE_NAME),
    });
    console.log(`[mailer] Admin order notification sent → ${ADMIN_EMAIL}`);
  } catch (err) {
    console.error(`[mailer] sendAdminOrderNotification failed:`, err.message);
  }
}

// ─── Payment Confirmed Email (Online Orders) ──────────────────────────────────
export async function sendPaymentConfirmedEmail(order) {
  const transporter = getOrderTransporter();
  if (!transporter) return;
  const toEmail = order.billingDetails?.email || order.userEmail;
  if (!toEmail) {
    console.warn(
      `[mailer] sendPaymentConfirmedEmail skipped — no email on order ${order._id}`,
    );
    return;
  }
  const STORE_NAME = await getStoreName();
  const billing = order.billingDetails || {};
  const orderNum = shortId(order._id);
  const itemRows = (order.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="56">
                ${item.image ? `<img src="${item.image}" width="48" height="48" style="border-radius:6px;object-fit:cover;" />` : ""}
              </td>
              <td style="padding-left:10px;">
                <div style="font-size:13px;color:#333;">${item.title}</div>
                ${item.color || item.size ? `<div style="font-size:11px;color:#888;">${[item.color, item.size].filter(Boolean).join(" / ")}</div>` : ""}
                <div style="font-size:12px;color:#888;">৳${item.price?.toFixed(2)} × ${item.quantity}</div>
              </td>
              <td align="right" style="font-size:14px;font-weight:600;color:#333;">
                ৳${((item.price || 0) * item.quantity).toFixed(2)}
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:30px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

      <!-- Header -->
      <tr><td style="background:#0d6efd;padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">💳 Payment Confirmed</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">${STORE_NAME}</p>
      </td></tr>

      <!-- Greeting -->
      <tr><td style="padding:32px 32px 0;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">Your payment was successful!</h2>
        <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
          Hi <strong>${billing.name || "Valued Customer"}</strong>, we have received your payment and your order is now being processed.
        </p>
      </td></tr>

      <!-- Order card -->
      <tr><td style="padding:24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;">
          <tr>
            <td style="font-size:12px;color:#888;">${formatDate(order.createdAt || new Date())}</td>
            <td align="right">
              <span style="background:#d1fae5;color:#065f46;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:600;">
                PAID
              </span>
            </td>
          </tr>
          <tr><td colspan="2" style="padding-top:6px;">
            <strong style="font-size:16px;color:#1a1a2e;">Order #${orderNum}</strong>
          </td></tr>
          ${
            order.valId
              ? `<tr><td colspan="2" style="padding-top:4px;font-size:12px;color:#888;">
            Transaction ref: <span style="font-family:monospace;">${order.valId}</span>
          </td></tr>`
              : ""
          }
        </table>
      </td></tr>

      <!-- Order Summary -->
      <tr><td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:14px 18px;background:#fafafa;border-bottom:1px solid #f0f0f0;">
            <strong style="font-size:15px;color:#1a1a2e;">Order Summary</strong>
          </td></tr>
          <tr><td style="padding:12px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#555;">
              <tr>
                <td style="padding:4px 0;">Subtotal</td>
                <td align="right" style="color:#333;font-weight:600;">৳${(order.subtotal || 0).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;">Discount</td>
                <td align="right" style="color:#333;font-weight:600;">৳${(order.discount || 0).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;">Shipping</td>
                <td align="right" style="color:#333;font-weight:600;">৳${(order.shipping || 0).toFixed(2)}</td>
              </tr>
            </table>
            <div style="border-top:2px dashed #e0e0e0;margin:10px 0;"></div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#065f46;font-weight:600;">Amount Paid</td>
                <td align="right" style="font-size:15px;color:#065f46;font-weight:700;">৳${(order.paidAmount ?? order.total ?? 0).toFixed(2)}</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <!-- Product Summary -->
      <tr><td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:14px 18px;background:#fafafa;border-bottom:1px solid #f0f0f0;">
            <strong style="font-size:15px;color:#1a1a2e;">Items</strong>
          </td></tr>
          <tr><td style="padding:4px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
          </td></tr>
        </table>
      </td></tr>

      <!-- View Order -->
      <tr><td style="padding:0 32px 24px;text-align:center;">
        <a href="${FRONTEND_URL}/user/orders" style="display:inline-block;background:#0d6efd;color:#fff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:700;">
          View My Orders
        </a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:20px 32px;background:#f9f9f9;border-top:1px solid #f0f0f0;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;color:#888;">
          Email: <a href="mailto:${ORDER_EMAIL}" style="color:#1a1a2e;">${ORDER_EMAIL}</a>
          ${STORE_PHONE ? ' | Phone: <span style="color:#1a1a2e;">' + STORE_PHONE + "</span>" : ""}
        </p>
        <p style="margin:0;font-size:11px;color:#aaa;">This is a payment confirmation for your order on ${STORE_NAME}.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"${STORE_NAME}" <${ORDER_EMAIL}>`,
      to: toEmail,
      bcc: ORDER_EMAIL,
      subject: `Payment Confirmed — #${orderNum} | ${STORE_NAME}`,
      html,
    });
    console.log(`[mailer] Payment confirmation sent → ${toEmail}`);
  } catch (err) {
    console.error(`[mailer] sendPaymentConfirmedEmail failed:`, err.message);
  }
}

// ─── Order Cancelled Email ────────────────────────────────────────────────────
export async function sendOrderCancelledEmail(
  order,
  { reason, cancelledBy = "customer" } = {},
) {
  const transporter = getOrderTransporter();
  if (!transporter) return;
  const toEmail = order.billingDetails?.email || order.userEmail;
  if (!toEmail) {
    console.warn(
      `[mailer] sendOrderCancelledEmail skipped — no email on order ${order._id}`,
    );
    return;
  }
  const STORE_NAME = await getStoreName();
  const billing = order.billingDetails || {};
  const orderNum = shortId(order._id);
  const byAdmin = cancelledBy !== "customer";
  const itemList = (order.items || [])
    .map(
      (i) =>
        `<li style="margin-bottom:4px;color:#555;font-size:13px;">${i.title} × ${i.quantity} — ৳${((i.price || 0) * i.quantity).toFixed(2)}</li>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:30px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

      <!-- Header -->
      <tr><td style="background:#dc2626;padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Order Cancelled</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">${STORE_NAME}</p>
      </td></tr>

      <!-- Greeting -->
      <tr><td style="padding:28px 32px 16px;">
        <p style="margin:0;font-size:14px;color:#555;line-height:1.7;">
          Hi <strong style="color:#333;">${billing.name || "Valued Customer"}</strong>,<br/>
          ${
            byAdmin
              ? `Your order <strong>#${orderNum}</strong> has been <strong>cancelled by our team</strong>.`
              : `Your order <strong>#${orderNum}</strong> has been <strong>cancelled</strong> as per your request.`
          }
        </p>
      </td></tr>

      <!-- Order card -->
      <tr><td style="padding:0 32px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;">
          <tr>
            <td style="font-size:12px;color:#888;">${formatDate(order.createdAt)}</td>
            <td align="right">
              <span style="background:#fee2e2;color:#dc2626;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:700;">CANCELLED</span>
            </td>
          </tr>
          <tr><td colspan="2" style="padding-top:6px;">
            <strong style="font-size:16px;color:#1a1a2e;">Order #${orderNum}</strong>
          </td></tr>
          <tr><td colspan="2" style="padding-top:8px;font-size:13px;color:#555;">
            Total: <strong>৳${(order.total || 0).toFixed(2)}</strong>
          </td></tr>
          ${
            reason
              ? `<tr><td colspan="2" style="padding-top:8px;font-size:13px;color:#555;">
            Reason: <em>${reason}</em>
          </td></tr>`
              : ""
          }
        </table>
      </td></tr>

      <!-- Items -->
      <tr><td style="padding:0 32px 24px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#333;">Cancelled Items</p>
        <ul style="margin:0;padding-left:18px;">${itemList}</ul>
      </td></tr>

      ${
        order.rewardPointsRedeemed > 0
          ? `
      <!-- Refund note -->
      <tr><td style="padding:0 32px 20px;">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;font-size:13px;color:#15803d;">
          Your <strong>${order.rewardPointsRedeemed} reward points</strong> have been refunded to your account.
        </div>
      </td></tr>`
          : ""
      }

      <!-- CTA -->
      <tr><td style="padding:0 32px 24px;text-align:center;">
        <a href="${FRONTEND_URL}/user/orders" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:700;">
          View My Orders
        </a>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:20px 32px;background:#f9f9f9;border-top:1px solid #f0f0f0;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;color:#888;">
          Questions? Email us at <a href="mailto:${ORDER_EMAIL}" style="color:#1a1a2e;">${ORDER_EMAIL}</a>
          ${STORE_PHONE ? ' or call <span style="color:#1a1a2e;">' + STORE_PHONE + "</span>" : ""}
        </p>
        <p style="margin:0;font-size:11px;color:#aaa;">You are receiving this email because you placed an order on ${STORE_NAME}.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"${STORE_NAME}" <${ORDER_EMAIL}>`,
      to: toEmail,
      bcc: ORDER_EMAIL,
      subject: `Order Cancelled — #${orderNum} | ${STORE_NAME}`,
      html,
    });
    console.log(`[mailer] Order cancelled email sent → ${toEmail}`);
  } catch (err) {
    console.error(`[mailer] sendOrderCancelledEmail failed:`, err.message);
  }
}

// ─── Abandoned Cart Recovery Email ───────────────────────────────────────────
export async function sendAbandonedCartEmail(session) {
  const transporter = getOrderTransporter();
  if (!transporter) return;
  const toEmail = session.userEmail;
  if (!toEmail) return;
  const STORE_NAME = await getStoreName();
  const name = session.userName || "there";
  const itemRows = (session.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f5f5f5;">
          <table cellpadding="0" cellspacing="0" width="100%"><tr>
            <td width="56">${item.image ? `<img src="${item.image}" width="48" height="48" style="border-radius:6px;object-fit:cover;" />` : ""}</td>
            <td style="padding-left:10px;font-size:13px;color:#333;">${item.title}<br/><span style="color:#888;font-size:12px;">৳${item.price?.toFixed(2)} × ${item.quantity}</span></td>
            <td align="right" style="font-size:14px;font-weight:600;color:#333;">৳${((item.price || 0) * item.quantity).toFixed(2)}</td>
          </tr></table>
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:30px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <tr><td style="background:#e11d48;padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">You left something behind!</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">${STORE_NAME}</p>
      </td></tr>
      <tr><td style="padding:32px 32px 16px;">
        <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.6;">Hi <strong>${name}</strong>, your cart is waiting for you. Complete your order before items sell out.</p>
        <table width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
        <p style="margin:16px 0 0;font-size:16px;font-weight:700;color:#1a1a2e;text-align:right;">Total: ৳${(session.total || 0).toFixed(2)}</p>
      </td></tr>
      <tr><td style="padding:0 32px 32px;text-align:center;">
        <a href="${FRONTEND_URL}/cart" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600;margin-top:8px;">Complete my order</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  try {
    await transporter.sendMail({
      from: `"${STORE_NAME}" <${ORDER_EMAIL}>`,
      to: toEmail,
      subject: `You left something in your cart — ${STORE_NAME}`,
      html,
    });
    console.log(`[mailer] Abandoned cart email sent → ${toEmail}`);
  } catch (err) {
    console.error(`[mailer] sendAbandonedCartEmail failed:`, err.message);
  }
}

// ─── Contact Form Email ───────────────────────────────────────────────────────
export async function sendContactEmail({ name, email, message }) {
  const transporter = getSupportTransporter();
  if (!transporter || !SUPPORT_EMAIL) return;
  const STORE_NAME = await getStoreName();

  const inboxHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:30px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <tr><td style="background:#1a1a2e;padding:20px 32px;">
        <h2 style="margin:0;color:#fff;font-size:18px;">New Contact Message — ${STORE_NAME}</h2>
      </td></tr>
      <tr><td style="padding:28px 32px;font-size:14px;color:#555;line-height:1.8;">
        <p style="margin:0 0 6px;"><strong style="color:#333;">Name:</strong> ${name}</p>
        <p style="margin:0 0 6px;"><strong style="color:#333;">Email:</strong> <a href="mailto:${email}" style="color:#1a1a2e;">${email}</a></p>
        <p style="margin:16px 0 6px;"><strong style="color:#333;">Message:</strong></p>
        <div style="background:#f9f9f9;border-left:4px solid #1a1a2e;padding:14px 18px;border-radius:0 6px 6px 0;white-space:pre-wrap;">${message}</div>
      </td></tr>
      <tr><td style="padding:16px 32px;background:#f9f9f9;border-top:1px solid #f0f0f0;text-align:center;font-size:11px;color:#aaa;">
        Sent via contact form on ${STORE_NAME}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const autoReplyHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:30px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <tr><td style="background:#1a1a2e;padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">🛍 ${STORE_NAME}</h1>
      </td></tr>
      <tr><td style="padding:32px 32px 24px;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">We received your message!</h2>
        <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.7;">
          Hi <strong>${name}</strong>, thank you for reaching out. We have received your message and will get back to you within 24 hours.
        </p>
        <div style="background:#f9f9f9;border-left:4px solid #ac0ad1;padding:14px 18px;border-radius:0 6px 6px 0;font-size:13px;color:#555;white-space:pre-wrap;">${message}</div>
      </td></tr>
      <tr><td style="padding:0 32px 28px;text-align:center;">
        <a href="${FRONTEND_URL}" style="display:inline-block;background:#ac0ad1;color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-size:14px;font-weight:600;">
          Visit ${STORE_NAME}
        </a>
      </td></tr>
      <tr><td style="padding:16px 32px;background:#f9f9f9;border-top:1px solid #f0f0f0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#888;">
          Email: <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a1a2e;">${SUPPORT_EMAIL}</a>
          ${STORE_PHONE ? ' | Phone: <span style="color:#1a1a2e;">' + STORE_PHONE + "</span>" : ""}
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const results = await Promise.allSettled([
    transporter.sendMail({
      from: `"${STORE_NAME} Support" <${SUPPORT_EMAIL}>`,
      to: SUPPORT_EMAIL,
      replyTo: email,
      subject: `Contact Form: ${name}`,
      html: inboxHtml,
    }),
    transporter.sendMail({
      from: `"${STORE_NAME} Support" <${SUPPORT_EMAIL}>`,
      to: email,
      subject: `We received your message — ${STORE_NAME}`,
      html: autoReplyHtml,
    }),
  ]);
  const recipients = [SUPPORT_EMAIL, email];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`[mailer] Contact email sent → ${recipients[i]}`);
    } else {
      console.error(
        `[mailer] Contact email FAILED → ${recipients[i]}:`,
        r.reason?.message,
      );
    }
  });
}
