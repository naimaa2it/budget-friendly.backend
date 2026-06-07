import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

export const POINTS_PER_TK = 100;

export function pointsToTk(points) {
  return Math.floor(Math.max(0, Number(points)) / POINTS_PER_TK);
}

export function calcLineRewardPoints(rewardPoints, quantity) {
  return Math.max(0, Number(rewardPoints) || 0) * Math.max(1, Number(quantity) || 1);
}

export function calcItemsRewardPoints(items) {
  return (items || []).reduce(
    (sum, item) => sum + calcLineRewardPoints(item.rewardPoints, item.quantity),
    0,
  );
}

export function resolveRedeemablePoints(requested, available, maxTkDiscount) {
  const req = Math.max(0, Math.floor(Number(requested) || 0));
  const avail = Math.max(0, Math.floor(Number(available) || 0));
  const capped = Math.min(req, avail);
  const maxPoints = Math.floor(Math.max(0, Number(maxTkDiscount) || 0) * POINTS_PER_TK);
  const redeemable = Math.min(capped, maxPoints);
  const pointsRedeemed = Math.floor(redeemable / POINTS_PER_TK) * POINTS_PER_TK;
  return {
    pointsRedeemed,
    pointsDiscount: pointsToTk(pointsRedeemed),
  };
}

export async function deductUserRewardPoints(userId, points) {
  const amount = Math.max(0, Math.floor(Number(points) || 0));
  if (!userId || amount <= 0) return;
  await User.findByIdAndUpdate(userId, { $inc: { rewardPointsBalance: -amount } });
}

export async function refundUserRewardPoints(userId, points) {
  const amount = Math.max(0, Math.floor(Number(points) || 0));
  if (!userId || amount <= 0) return;
  await User.findByIdAndUpdate(userId, { $inc: { rewardPointsBalance: amount } });
}

export async function creditOrderRewardPoints(order) {
  if (!order?.userId || order.rewardPointsCredited) return false;

  let earned = order.rewardPointsEarned;
  if (earned == null) {
    const productIds = (order.items || []).map((i) => i.productId).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('rewardPoints')
      .lean();
    const map = Object.fromEntries(products.map((p) => [String(p._id), p]));
    earned = (order.items || []).reduce((sum, item) => {
      const rp = item.rewardPoints ?? map[item.productId]?.rewardPoints ?? 0;
      return sum + calcLineRewardPoints(rp, item.quantity);
    }, 0);
    order.rewardPointsEarned = earned;
  }

  if (earned <= 0) return false;

  await User.findByIdAndUpdate(order.userId, { $inc: { rewardPointsBalance: earned } });
  order.rewardPointsCredited = true;
  order.rewardPointsCreditedAt = new Date();
  return true;
}

export async function enrichOrderItemsWithRewardPoints(items) {
  const productIds = (items || []).map((i) => i.productId).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } })
    .select('rewardPoints title')
    .lean();
  const map = Object.fromEntries(products.map((p) => [String(p._id), p]));

  return (items || []).map((item) => {
    const prod = map[String(item.productId)];
    const rewardPoints = Number(item.rewardPoints ?? prod?.rewardPoints ?? 0);
    return {
      ...item,
      rewardPoints,
      lineRewardPoints: calcLineRewardPoints(rewardPoints, item.quantity),
    };
  });
}

export async function buildUserRewardsSummary(userId) {
  const user = await User.findById(userId).select('rewardPointsBalance name email').lean();
  if (!user) return null;

  const orders = await Order.find({ userId: String(userId) })
    .sort({ createdAt: -1 })
    .lean();

  let totalEarned = 0;
  let totalPending = 0;
  let totalRedeemed = 0;

  const orderSummaries = [];
  for (const order of orders) {
    const items = await enrichOrderItemsWithRewardPoints(order.items);
    const orderPoints = calcItemsRewardPoints(items);
    const redeemed = order.rewardPointsRedeemed || 0;
    totalRedeemed += redeemed;

    if (order.rewardPointsCredited || order.status === 'delivered') {
      totalEarned += order.rewardPointsEarned ?? orderPoints;
    } else if (!['cancelled', 'failed'].includes(order.status)) {
      totalPending += orderPoints;
    }

    orderSummaries.push({
      _id: order._id,
      status: order.status,
      createdAt: order.createdAt,
      items,
      orderPoints,
      rewardPointsRedeemed: redeemed,
      rewardPointsDiscount: order.rewardPointsDiscount || 0,
      credited: Boolean(order.rewardPointsCredited),
    });
  }

  return {
    balance: user.rewardPointsBalance || 0,
    balanceValueTk: pointsToTk(user.rewardPointsBalance || 0),
    pointsPerTk: POINTS_PER_TK,
    totals: {
      earned: totalEarned,
      pending: totalPending,
      redeemed: totalRedeemed,
    },
    orders: orderSummaries,
  };
}
