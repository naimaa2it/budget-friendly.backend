import { appendManualTrackingEvent } from './shipmentTracking.js';

export function appendStatusHistory(order, { previousStatus, newStatus, reason = '', changedBy = 'system' }) {
  if (!order.statusHistory) order.statusHistory = [];
  order.statusHistory.push({
    previousStatus: previousStatus ?? null,
    newStatus,
    reason: String(reason || '').trim(),
    changedBy,
    at: new Date(),
  });
}

export function applyOrderStatusChange(order, newStatus, { reason = '', changedBy = 'system' } = {}) {
  const previousStatus = order.status;
  if (previousStatus === newStatus) return false;

  order.status = newStatus;
  appendStatusHistory(order, { previousStatus, newStatus, reason, changedBy });

  if (newStatus === 'delivered') {
    if (!order.shipment) order.shipment = { trackingEvents: [] };
    order.shipment.deliveredAt = new Date();
    appendManualTrackingEvent(order, {
      status: 'delivered',
      message: reason || 'Delivered',
    });
  }

  order.updatedAt = new Date();
  return true;
}
