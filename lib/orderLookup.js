import mongoose from 'mongoose';
import Order from '../models/Order.js';

export function formatOrderIdSuffix(id) {
  return String(id || '').slice(-8).toUpperCase();
}

export function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function isFullObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || '').trim());
}

export async function findOrderByIdOrSuffix(rawId) {
  const clean = String(rawId || '').trim().replace(/^#/, '');
  if (!clean) return null;

  if (isFullObjectId(clean)) {
    return Order.findById(clean);
  }

  const suffix = clean.toUpperCase().slice(-8);
  const matches = await Order.aggregate([
    {
      $addFields: {
        idSuffix: {
          $toUpper: { $substr: [{ $toString: '$_id' }, 16, 8] },
        },
      },
    },
    { $match: { idSuffix: suffix } },
    { $sort: { createdAt: -1 } },
    { $limit: 1 },
  ]);

  if (!matches.length) return null;
  return Order.findById(matches[0]._id);
}

export async function findOrdersByPhone(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return [];

  const tail = digits.length >= 10 ? digits.slice(-10) : digits;
  const pattern = new RegExp(`${tail}$`);

  return Order.find({ 'billingDetails.phone': pattern })
    .sort({ createdAt: -1 })
    .limit(50);
}

export function phoneMatchesOrder(order, phone) {
  const orderPhone = normalizePhone(order?.billingDetails?.phone);
  const queryPhone = normalizePhone(phone);
  if (!orderPhone || !queryPhone) return false;
  return (
    orderPhone === queryPhone ||
    orderPhone.endsWith(queryPhone) ||
    queryPhone.endsWith(orderPhone)
  );
}

export function toPublicTrackOrder(order) {
  return {
    _id: order._id,
    orderId: formatOrderIdSuffix(order._id),
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items,
    total: order.total,
    billingDetails: {
      name: order.billingDetails?.name,
      phone: order.billingDetails?.phone,
      city: order.billingDetails?.city,
    },
    shipment: order.shipment,
    assignedAgent: order.assignedAgent || null,
  };
}
