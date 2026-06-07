import { formatOrderIdSuffix } from '../orderLookup.js';
import { getCourierIntegration } from '../courierCredentials.js';
import { normalizeBdMobile, isValidBdMobile } from '../courierFraudCheck.js';
import { createPathaoOrder } from './createPathaoOrder.js';
import { createSteadfastOrder } from './createSteadfastOrder.js';
import { createRedxOrder } from './createRedxOrder.js';

function buildRecipientAddress(order) {
  const b = order.billingDetails || {};
  const parts = [b.address, b.area, b.zone, b.city].filter(Boolean);
  return parts.join(', ') || b.address || '';
}

function defaultCodAmount(order) {
  if (order.paymentMethod === 'cash-on-delivery') {
    return Math.round(Number(order.total || 0));
  }
  return 0;
}

export function validateOrderForBooking(order) {
  const phone = normalizeBdMobile(order.billingDetails?.phone);
  const address = buildRecipientAddress(order);
  const name = order.billingDetails?.name;

  if (!name?.trim()) return { ok: false, error: 'Customer name is required' };
  if (!isValidBdMobile(phone)) {
    return { ok: false, error: 'Valid BD mobile (01XXXXXXXXX) is required' };
  }
  if (!address.trim() || address.length < 10) {
    return { ok: false, error: 'Customer delivery address is required (min 10 chars)' };
  }
  if (order.shipment?.bookingSource === 'api' && order.shipment?.trackingId) {
    return { ok: false, error: 'Parcel already booked via API for this order' };
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
      code: 'courier_not_configured',
    };
  }

  if (integration.apiEnabled === false) {
    return { ok: false, error: `${slug} API is disabled in settings` };
  }

  if (integration.capabilities?.parcelCreate === false) {
    return { ok: false, error: `Parcel booking is disabled for ${slug}` };
  }

  const payload = {
    merchantOrderId: formatOrderIdSuffix(order._id),
    recipientName: validation.name,
    recipientPhone: validation.phone,
    recipientAddress: validation.address,
    recipientCity: order.billingDetails?.city || '',
    codAmount: options.codAmount ?? defaultCodAmount(order),
    weight: Number(options.weight || integration.storeConfig?.defaultWeight || 0.5),
    weightGrams: Math.round(
      Number(options.weightGrams || (options.weight || integration.storeConfig?.defaultWeight || 0.5) * 1000),
    ),
    itemQuantity: Number(options.itemQuantity || 1),
    itemDescription: options.itemDescription || 'yourHaat order',
    note: options.note || order.billingDetails?.note || '',
    declaredValue: options.declaredValue ?? defaultCodAmount(order),
    deliveryAreaId: options.deliveryAreaId,
    deliveryAreaName: options.deliveryAreaName,
  };

  let result;
  switch (slug) {
    case 'pathao':
      result = await createPathaoOrder(integration.creds, integration.storeConfig, payload);
      break;
    case 'steadfast':
      result = await createSteadfastOrder(integration.creds, integration.storeConfig, payload);
      break;
    case 'redx':
      result = await createRedxOrder(integration.creds, integration.storeConfig, payload);
      break;
    default:
      return { ok: false, error: 'Unsupported courier for API booking' };
  }

  if (!result.consignmentId) {
    return { ok: false, error: 'Courier did not return a tracking/consignment ID', raw: result.raw };
  }

  return {
    ok: true,
    courier: slug,
    consignmentId: result.consignmentId,
    trackingUrl: result.trackingUrl,
    raw: result.raw,
  };
}
