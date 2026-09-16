import { formatOrderIdSuffix } from "../orderLookup.js";
import { getCourierIntegration } from "../courierCredentials.js";
import { normalizeBdMobile, isValidBdMobile } from "../courierFraudCheck.js";
import { createPathaoOrder } from "./createPathaoOrder.js";
import { createSteadfastOrder } from "./createSteadfastOrder.js";
import { createRedxOrder } from "./createRedxOrder.js";

function buildRecipientAddress(order) {
  const b = order.billingDetails || {};
  const parts = [b.address, b.area, b.zone, b.city].filter(Boolean);
  return parts.join(", ") || b.address || "";
}

function defaultCodAmount(order) {
  if (order.paymentMethod === "cash-on-delivery") {
    return Math.round(Number(order.total || 0));
  }
  return 0;
}

// Build a product-name based item description so the courier parcel shows what
// is inside (e.g. "T-Shirt x2 (৳500), Cap (৳300)"), not just a generic
// "Pickob order" label. Includes name, quantity, variant and unit price so the
// merchant/rider can tell exactly which product and at what price.
function buildItemDescription(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const parts = items
    .map((it) => {
      const title = String(it?.title || "").trim();
      if (!title) return null;
      const qty = Number(it?.quantity || 0);
      const price = Number(it?.price || 0);
      const variant = [
        it?.color,
        it?.size,
        it?.attrGroup && it?.attrValue ? `${it.attrGroup}: ${it.attrValue}` : null,
      ]
        .filter(Boolean)
        .join("/");
      let label = title;
      if (variant) label += ` (${variant})`;
      if (qty > 1) label += ` x${qty}`;
      if (price > 0) label += ` ৳${Math.round(price)}`;
      return label;
    })
    .filter(Boolean);
  if (!parts.length) return "";
  // Keep well under courier field limits (Steadfast/Pathao cap ~250 chars).
  return parts.join(", ").slice(0, 240);
}

// Total item count across the order, used as a sensible default lot/quantity.
function defaultItemQuantity(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const total = items.reduce((sum, it) => sum + Number(it?.quantity || 0), 0);
  return total > 0 ? total : 1;
}

export function validateOrderForBooking(order) {
  const phone = normalizeBdMobile(order.billingDetails?.phone);
  const address = buildRecipientAddress(order);
  const name = order.billingDetails?.name;

  if (!name?.trim()) return { ok: false, error: "Customer name is required" };
  if (!isValidBdMobile(phone)) {
    return { ok: false, error: "Valid BD mobile (01XXXXXXXXX) is required" };
  }
  if (!address.trim() || address.length < 10) {
    return {
      ok: false,
      error: "Customer delivery address is required (min 10 chars)",
    };
  }
  if (order.shipment?.bookingSource === "api" && order.shipment?.trackingId) {
    return { ok: false, error: "Parcel already booked via API for this order" };
  }
  return { ok: true, phone, address, name: name.trim() };
}

export async function bookParcelWithCourier(order, courierSlug, options = {}) {
  const slug = String(courierSlug).toLowerCase();
  const validation = validateOrderForBooking(order);
  if (!validation.ok) return validation;

  const integration = await getCourierIntegration(slug);
  if (!integration.configured) {
    return {
      ok: false,
      error: `${slug} is not configured. Add credentials in Shipment Settings.`,
      code: "courier_not_configured",
    };
  }

  if (integration.apiEnabled === false) {
    return { ok: false, error: `${slug} API is disabled in settings` };
  }

  if (integration.capabilities?.parcelCreate === false) {
    return { ok: false, error: `Parcel booking is disabled for ${slug}` };
  }

  // Reference the courier stores/echoes back. New orders → "pk100000";
  // legacy orders (no orderNo) keep their existing 8-char suffix so already
  // booked/reconciled parcels stay consistent. No leading "#" here — courier
  // invoice/merchant-id fields want a clean alphanumeric token.
  const merchantOrderId =
    order.orderNo != null && order.orderNo !== ""
      ? `pk${order.orderNo}`
      : formatOrderIdSuffix(order._id);

  // Store/site name (e.g. "Pickob") so the courier parcel shows which shop it
  // came from, right in the description text.
  let storeName = "Pickob";
  try {
    const Setting = (await import("../../models/Setting.js")).default;
    const settings = await Setting.findOne().lean();
    if (settings?.storeName) storeName = String(settings.storeName).trim();
  } catch {
    // fall back to default store name
  }

  // Product list, prefixed with the store name + order id so both are plainly
  // visible right next to the item info on the courier panel (the order id also
  // goes in the dedicated merchant-invoice field below).
  const products = buildItemDescription(order);
  const prefix = `${storeName} #${merchantOrderId}`;
  const itemDescription = products
    ? `${prefix} — ${products}`.slice(0, 240)
    : prefix;

  const payload = {
    orderId: order._id,
    merchantOrderId,
    recipientName: validation.name,
    recipientPhone: validation.phone,
    recipientAddress: validation.address,
    recipientCity: order.billingDetails?.city || "",
    codAmount: options.codAmount ?? defaultCodAmount(order),
    weight: Number(
      options.weight || integration.storeConfig?.defaultWeight || 0.5,
    ),
    weightGrams: Math.round(
      Number(
        options.weightGrams ||
          (options.weight || integration.storeConfig?.defaultWeight || 0.5) *
            1000,
      ),
    ),
    itemQuantity: Number(options.itemQuantity || defaultItemQuantity(order)),
    itemDescription: options.itemDescription || itemDescription,
    note: options.note || order.billingDetails?.note || "",
    declaredValue: options.declaredValue ?? defaultCodAmount(order),
    deliveryAreaId: options.deliveryAreaId,
    deliveryAreaName: options.deliveryAreaName,
  };

  let result;
  switch (slug) {
    case "pathao":
      result = await createPathaoOrder(
        integration.creds,
        integration.storeConfig,
        payload,
      );
      break;
    case "steadfast":
      result = await createSteadfastOrder(
        integration.creds,
        integration.storeConfig,
        payload,
      );
      break;
    case "redx":
      result = await createRedxOrder(
        integration.creds,
        integration.storeConfig,
        payload,
      );
      break;
    default:
      return { ok: false, error: "Unsupported courier for API booking" };
  }

  if (!result.consignmentId) {
    return {
      ok: false,
      error: "Courier did not return a tracking/consignment ID",
      raw: result.raw,
    };
  }

  return {
    ok: true,
    courier: slug,
    consignmentId: result.consignmentId,
    trackingUrl: result.trackingUrl,
    raw: result.raw,
  };
}
