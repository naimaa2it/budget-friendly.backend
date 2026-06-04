import Order from '../models/Order.js';
import { fetchCourierTracking, mapCourierStatusToOrderStatus } from './couriers/index.js';
import { COURIER_LABELS } from './couriers/constants.js';
import { anyCourierSyncConfigured, isCourierSyncConfigured } from './couriers/syncConfig.js';

const TERMINAL_STATUSES = new Set(['delivered', 'cancelled', 'failed']);

function mergeTrackingEvents(existing = [], incoming = []) {
  const seen = new Set(
    existing.map((e) => `${e.status}|${e.message}|${new Date(e.at).toISOString()}`),
  );
  const merged = [...existing];
  for (const event of incoming) {
    const key = `${event.status}|${event.message}|${new Date(event.at).toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }
  merged.sort((a, b) => new Date(a.at) - new Date(b.at));
  return merged;
}

export async function syncOrderShipment(orderDoc, { force = false } = {}) {
  const order = orderDoc?.save ? orderDoc : await Order.findById(orderDoc);
  if (!order?.shipment?.courier || !order.shipment.trackingId) {
    return { ok: false, reason: 'missing_courier_or_tracking' };
  }

  if (!isCourierSyncConfigured(order.shipment.courier)) {
    return { ok: false, reason: 'courier_api_not_configured' };
  }

  const lastSyncAt = order.shipment.lastSyncAt ? new Date(order.shipment.lastSyncAt) : null;
  if (
    !force &&
    lastSyncAt &&
    Date.now() - lastSyncAt.getTime() < 5 * 60 * 1000
  ) {
    return { ok: true, skipped: true, order };
  }

  const result = await fetchCourierTracking(
    order.shipment.courier,
    order.shipment.trackingId,
  );

  if (result.configured === false) {
    return { ok: false, reason: 'courier_api_not_configured' };
  }

  if (result.courierStatus) {
    order.shipment.courierStatus = result.courierStatus;
  }

  if (result.events?.length) {
    order.shipment.trackingEvents = mergeTrackingEvents(
      order.shipment.trackingEvents,
      result.events,
    );
  }

  order.shipment.lastSyncAt = new Date();

  const mappedStatus = mapCourierStatusToOrderStatus(
    order.shipment.courier,
    result.courierStatus,
  );
  if (
    mappedStatus &&
    !TERMINAL_STATUSES.has(order.status) &&
    mappedStatus !== order.status
  ) {
    order.status = mappedStatus;
    if (mappedStatus === 'delivered') {
      order.shipment.deliveredAt = new Date();
    }
  }

  order.updatedAt = new Date();
  await order.save();
  return { ok: true, order, sync: result };
}

export async function syncActiveShipments(limit = 20) {
  if (!anyCourierSyncConfigured()) {
    return [];
  }

  const orders = await Order.find({
    status: { $in: ['shipped', 'processing', 'confirmed'] },
    'shipment.courier': { $ne: null },
    'shipment.trackingId': { $ne: null },
  })
    .sort({ 'shipment.lastSyncAt': 1, updatedAt: -1 })
    .limit(limit);

  const results = [];
  for (const order of orders) {
    try {
      results.push(await syncOrderShipment(order));
    } catch (err) {
      results.push({ ok: false, orderId: order._id, error: err.message });
    }
  }
  return results;
}

export function appendAdminTrackingEvent(order, message, status = 'handed_to_courier') {
  const courierLabel = COURIER_LABELS[order.shipment?.courier] || order.shipment?.courier;
  order.shipment.trackingEvents = mergeTrackingEvents(order.shipment.trackingEvents, [
    {
      status,
      message: message || `Parcel handed over to ${courierLabel || 'courier'}`,
      at: new Date(),
      source: 'admin',
    },
  ]);
}

export function appendManualTrackingEvent(order, { status, message }) {
  if (!order.shipment) order.shipment = { trackingEvents: [] };
  const label = message || status || 'Update';
  order.shipment.trackingEvents = mergeTrackingEvents(order.shipment.trackingEvents, [
    {
      status: status || 'update',
      message: label,
      at: new Date(),
      source: 'admin',
    },
  ]);
  order.shipment.courierStatus = label;
}
