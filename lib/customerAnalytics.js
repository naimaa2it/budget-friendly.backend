const ACCEPTED_STATUSES = new Set([
  'accepted',
  'approved',
  'picked',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
]);

function emptyCourierBucket() {
  return {
    total: 0,
    delivered: 0,
    cancelled: 0,
    returned: 0,
    rejected: 0,
    accepted: 0,
    pending: 0,
  };
}

function courierKey(order) {
  const slug = order.shipment?.courier;
  if (!slug) return 'unassigned';
  return String(slug).toLowerCase().trim();
}

function bumpCourier(bucket, status) {
  bucket.total += 1;
  if (status === 'delivered') bucket.delivered += 1;
  else if (status === 'cancelled') bucket.cancelled += 1;
  else if (status === 'failed') bucket.returned += 1;
  else if (status === 'rejected') bucket.rejected += 1;
  else if (status === 'pending') bucket.pending += 1;
  else if (ACCEPTED_STATUSES.has(status)) bucket.accepted += 1;
}

export function computeCustomerAnalytics(orders = []) {
  const stats = {
    totalOrders: orders.length,
    delivered: 0,
    cancelled: 0,
    returned: 0,
    rejected: 0,
    pending: 0,
    accepted: 0,
    failed: 0,
  };

  const courierBreakdown = {};

  for (const order of orders) {
    const status = order.status || 'pending';
    if (status === 'delivered') stats.delivered += 1;
    else if (status === 'cancelled') stats.cancelled += 1;
    else if (status === 'failed') {
      stats.returned += 1;
      stats.failed += 1;
    } else if (status === 'rejected') stats.rejected += 1;
    else if (status === 'pending') stats.pending += 1;
    else if (ACCEPTED_STATUSES.has(status)) stats.accepted += 1;

    const key = courierKey(order);
    if (!courierBreakdown[key]) courierBreakdown[key] = emptyCourierBucket();
    bumpCourier(courierBreakdown[key], status);
  }

  const completed = stats.delivered + stats.cancelled + stats.returned + stats.rejected;
  const deliverySuccessRate = completed > 0
    ? Math.round((stats.delivered / completed) * 100)
    : stats.totalOrders > 0
      ? Math.round((stats.delivered / stats.totalOrders) * 100)
      : 0;

  const total = stats.totalOrders || 1;
  const cancellationRate = Math.round((stats.cancelled / total) * 100);
  const rejectionRate = Math.round((stats.rejected / total) * 100);
  const returnRate = Math.round((stats.returned / total) * 100);
  const pendingRate = Math.round((stats.pending / total) * 100);

  let riskScore = 0;
  riskScore += cancellationRate * 0.35;
  riskScore += rejectionRate * 0.25;
  riskScore += returnRate * 0.25;
  riskScore += pendingRate * 0.1;
  riskScore += Math.max(0, 100 - deliverySuccessRate) * 0.15;
  riskScore = Math.min(100, Math.round(riskScore));

  let riskLevel = 'low';
  let riskLabel = 'Trusted customer';
  if (riskScore >= 65) {
    riskLevel = 'high';
    riskLabel = 'High risk — possible fraud';
  } else if (riskScore >= 35) {
    riskLevel = 'medium';
    riskLabel = 'Moderate risk — review carefully';
  }

  const riskFactors = [];
  if (cancellationRate >= 25) riskFactors.push(`High cancellation rate (${cancellationRate}%)`);
  if (rejectionRate >= 15) riskFactors.push(`Frequent rejections (${rejectionRate}%)`);
  if (returnRate >= 15) riskFactors.push(`Frequent returns/failures (${returnRate}%)`);
  if (deliverySuccessRate < 50 && completed >= 3) {
    riskFactors.push(`Low delivery success (${deliverySuccessRate}%)`);
  }
  if (stats.pending >= 3 && stats.delivered === 0) {
    riskFactors.push('Many pending orders, none delivered yet');
  }
  if (!riskFactors.length) riskFactors.push('No major risk signals detected');

  return {
    stats,
    percentages: {
      deliverySuccessRate,
      cancellationRate,
      rejectionRate,
      returnRate,
      pendingRate,
      acceptanceRate: Math.round((stats.accepted / total) * 100),
    },
    courierBreakdown,
    risk: {
      score: riskScore,
      level: riskLevel,
      label: riskLabel,
      factors: riskFactors,
    },
  };
}

export function summarizeOrdersForList(orders = []) {
  const analytics = computeCustomerAnalytics(orders);
  return {
    totalOrders: analytics.stats.totalOrders,
    delivered: analytics.stats.delivered,
    cancelled: analytics.stats.cancelled,
    returned: analytics.stats.returned,
    deliverySuccessRate: analytics.percentages.deliverySuccessRate,
    riskScore: analytics.risk.score,
    riskLevel: analytics.risk.level,
  };
}
