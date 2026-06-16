import Order from "../models/Order.js";

// Tiers are based on lifetime spend across DELIVERED orders only — pending/
// cancelled orders never count, so the metric can't be inflated by abandoned carts.
export const LOYALTY_TIERS = [
  {
    key: "silver",
    label: "Silver",
    minSpend: 0,
    perks: ["Earn reward points on every order", "Birthday surprise offer"],
  },
  {
    key: "gold",
    label: "Gold",
    minSpend: 15000,
    perks: [
      "All Silver perks",
      "Free shipping on orders above ৳999",
      "Early access to flash sales",
    ],
  },
  {
    key: "platinum",
    label: "Platinum",
    minSpend: 50000,
    perks: [
      "All Gold perks",
      "Priority customer support",
      "Exclusive Platinum-only deals",
    ],
  },
];

export function resolveTier(lifetimeSpend) {
  const spend = Math.max(0, Number(lifetimeSpend) || 0);
  let current = LOYALTY_TIERS[0];
  for (const tier of LOYALTY_TIERS) {
    if (spend >= tier.minSpend) current = tier;
  }
  const currentIndex = LOYALTY_TIERS.findIndex((t) => t.key === current.key);
  const nextTier = LOYALTY_TIERS[currentIndex + 1] || null;
  const amountToNextTier = nextTier
    ? Math.max(0, nextTier.minSpend - spend)
    : 0;
  const tierProgressPct = nextTier
    ? Math.min(
        100,
        Math.round(
          ((spend - current.minSpend) / (nextTier.minSpend - current.minSpend)) *
            100,
        ),
      )
    : 100;
  return { tier: current, nextTier, amountToNextTier, tierProgressPct };
}

export async function getUserLoyaltySummary(userId) {
  const [agg] = await Order.aggregate([
    { $match: { userId: String(userId), status: "delivered" } },
    {
      $group: {
        _id: null,
        lifetimeSpend: { $sum: "$total" },
        deliveredOrders: { $sum: 1 },
      },
    },
  ]);
  const lifetimeSpend = agg?.lifetimeSpend || 0;
  const deliveredOrders = agg?.deliveredOrders || 0;
  const { tier, nextTier, amountToNextTier, tierProgressPct } =
    resolveTier(lifetimeSpend);

  return {
    lifetimeSpend,
    deliveredOrders,
    tier: { key: tier.key, label: tier.label, perks: tier.perks },
    nextTier: nextTier
      ? { key: nextTier.key, label: nextTier.label, minSpend: nextTier.minSpend }
      : null,
    amountToNextTier,
    tierProgressPct,
    allTiers: LOYALTY_TIERS.map((t) => ({
      key: t.key,
      label: t.label,
      minSpend: t.minSpend,
    })),
  };
}
