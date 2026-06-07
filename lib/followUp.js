import { applyOrderStatusChange } from './orderStatus.js';

export function appendFollowUpHistory(order, { action, reason = '', notes = '', byAdminId, byName = '' }) {
  if (!order.followUpHistory) order.followUpHistory = [];
  order.followUpHistory.push({
    action,
    reason: String(reason || '').trim(),
    notes: String(notes || '').trim(),
    byAdminId: byAdminId || null,
    byName: String(byName || '').trim(),
    at: new Date(),
  });
}

export function applyFollowUpAction(order, action, { reason = '', notes = '', byAdminId, byName = '' } = {}) {
  appendFollowUpHistory(order, { action, reason, notes, byAdminId, byName });

  if (action === 'assigned') {
    order.followUpStatus = 'assigned';
    return;
  }
  if (action === 'called') {
    order.followUpStatus = 'called';
    return;
  }
  if (action === 'accepted') {
    order.followUpStatus = 'accepted';
    applyOrderStatusChange(order, 'approved', {
      reason: reason || notes || 'Customer confirmed by phone',
      changedBy: byName || 'admin',
    });
    return;
  }
  if (action === 'rejected') {
    order.followUpStatus = 'rejected';
    applyOrderStatusChange(order, 'rejected', {
      reason: reason || notes || 'Customer rejected by phone',
      changedBy: byName || 'admin',
    });
  }
}
