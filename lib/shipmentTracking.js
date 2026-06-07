import Order from '../models/Order.js';
import { fetchCourierTracking, mapCourierStatusToOrderStatus } from './couriers/index.js';
import { COURIER_LABELS } from './couriers/constants.js';
import { anyCourierSyncConfigured, isCourierSyncConfigured } from './couriers/syncConfig.js';
import {
  extractTrackingIdFromUrl,
  inferCourierFromUrl,
} from './couriers/trackingUtils.js';

const TERMINAL_STATUSES = new Set(['delivered', 'cancelled', 'failed']);

function resolveTrackingRef(shipment) {
  if (!shipment) return { courier: null, trackingId: null };

  let courier = shipment.courier || null;
  let trackingId = shipment.trackingId ? String(shipment.trackingId).trim() : null;

  if (shipment.trackingUrl) {
    if (!courier) courier = inferCourierFromUrl(shipment.trackingUrl);
    if (!trackingId) {
      trackingId = extractTrackingIdFromUrl(courier, shipment.trackingUrl);
    }
  }

  return { courier, trackingId };
}

async function canSyncCourier(courier) {
  if (!courier) return false;
  if (courier === 'steadfast') return true;
  return isCourierSyncConfigured(courier);
}

export async function syncOrderShipment(orderDoc, { force = false } = {}) {
  const order = orderDoc?.save ? orderDoc : await Order.findById(orderDoc);
  if (!order) return { ok: false, reason: 'order_not_found' };

  const { courier, trackingId } = resolveTrackingRef(order.shipment);
  if (!courier || !trackingId) {
    return { ok: false, reason: 'missing_courier_or_tracking' };
  }

  if (!(await canSyncCourier(courier))) {
    return { ok: false, reason: 'courier_sync_not_available' };
  }

  if (courier !== order.shipment.courier) order.shipment.courier = courier;
  if (trackingId !== order.shipment.trackingId) order.shipment.trackingId = trackingId;

  const lastSyncAt = order.shipment.lastSyncAt ? new Date(order.shipment.lastSyncAt) : null;
  if (!force && lastSyncAt && Date.now() - lastSyncAt.getTime() < 2 * 60 * 1000) {
    return { ok: true, skipped: true, order };
  }

  const result = await fetchCourierTracking(courier, trackingId);

  if (result.configured === false && courier !== 'steadfast') {
    return { ok: false, reason: 'courier_api_not_configured' };
  }

  if (result.courierStatus) {
    order.shipment.courierStatus = result.courierStatus;
  }

  if (result.events?.length) {
    order.shipment.trackingEvents = result.events.map((e) => ({
      status: e.status,
      message: e.message,
      at: e.at ? new Date(e.at) : new Date(),
      source: 'courier',
    }));
  }

  order.shipment.lastSyncAt = new Date();

  const mappedStatus = mapCourierStatusToOrderStatus(courier, result.courierStatus);
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

  if (
    result.events?.length &&
    !order.shipment.handedToCourierAt &&
    ['confirmed', 'processing', 'accepted', 'approved', 'picked'].includes(order.status)
  ) {
    order.shipment.handedToCourierAt = new Date();
    if (order.status === 'confirmed' || order.status === 'processing') {
      order.status = 'shipped';
    }
  }

  order.updatedAt = new Date();
  await order.save();
  return { ok: true, order, sync: result };
}

export async function syncActiveShipments(limit = 20) {
  const orders = await Order.find({
    status: { $nin: ['delivered', 'cancelled', 'failed'] },
    $or: [
      {
        'shipment.courier': { $ne: null },
        'shipment.trackingId': { $ne: null },
      },
      { 'shipment.trackingUrl': { $ne: null } },
    ],
  })
    .sort({ 'shipment.lastSyncAt': 1, updatedAt: -1 })
    .limit(limit);

  const results = [];
  for (const order of orders) {
    try {
      const { courier } = resolveTrackingRef(order.shipment);
      if (courier === 'steadfast' || (await anyCourierSyncConfigured())) {
        results.push(await syncOrderShipment(order, { force: false }));
      }
    } catch (err) {
      results.push({ ok: false, orderId: order._id, error: err.message });
    }
  }
  return results;
}

export function appendAdminTrackingEvent(order, message, status = 'handed_to_courier') {
  const courierLabel = COURIER_LABELS[order.shipment?.courier] || order.shipment?.courier;
  if (!order.shipment) order.shipment = { trackingEvents: [] };
  order.shipment.trackingEvents = [
    ...(order.shipment.trackingEvents || []),
    {
      status,
      message: message || `Parcel handed over to ${courierLabel || 'courier'}`,
      at: new Date(),
      source: 'admin',
    },
  ];
}

export function appendManualTrackingEvent(order, { status, message }) {
  if (!order.shipment) order.shipment = { trackingEvents: [] };
  const label = message || status || 'Update';
  order.shipment.trackingEvents = [
    ...(order.shipment.trackingEvents || []),
    {
      status: status || 'update',
      message: label,
      at: new Date(),
      source: 'admin',
    },
  ];
  order.shipment.courierStatus = label;
}
