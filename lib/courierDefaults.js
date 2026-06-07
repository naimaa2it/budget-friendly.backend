import Courier from '../models/Courier.js';
import TimelinePreset from '../models/TimelinePreset.js';

const DEFAULT_COURIERS = [
  {
    name: 'Pathao',
    slug: 'pathao',
    trackingUrlTemplate: 'https://merchant.pathao.com/courier/tracking?consignment_id={id}',
    sortOrder: 1,
    isSystem: true,
  },
  {
    name: 'Steadfast',
    slug: 'steadfast',
    trackingUrlTemplate: 'https://steadfast.com.bd/t/{id}',
    sortOrder: 2,
    isSystem: true,
  },
  {
    name: 'RedX',
    slug: 'redx',
    trackingUrlTemplate: 'https://redx.com.bd/track/{id}',
    sortOrder: 3,
    isSystem: true,
  },
  {
    name: 'Sundarban Courier',
    slug: 'sundarban',
    trackingUrlTemplate: '',
    sortOrder: 4,
    isSystem: true,
  },
  {
    name: 'Other',
    slug: 'other',
    trackingUrlTemplate: '',
    sortOrder: 99,
    isSystem: true,
  },
];

const DEFAULT_TIMELINE_PRESETS = [
  { label: 'Picked up', statusKey: 'picked_up', sortOrder: 1 },
  { label: 'In transit', statusKey: 'in_transit', sortOrder: 2 },
  { label: 'At hub', statusKey: 'at_hub', sortOrder: 3 },
  { label: 'Out for delivery', statusKey: 'out_for_delivery', sortOrder: 4 },
  { label: 'Delivered', statusKey: 'delivered', sortOrder: 5 },
  { label: 'Confirmed', statusKey: 'confirmed', sortOrder: 6 },
];

/** Seed defaults only on first install (empty collection). Never re-seed on GET. */
export async function seedDefaultsIfEmpty() {
  const [courierCount, presetCount] = await Promise.all([
    Courier.countDocuments(),
    TimelinePreset.countDocuments(),
  ]);
  if (courierCount === 0) await Courier.insertMany(DEFAULT_COURIERS);
  if (presetCount === 0) await TimelinePreset.insertMany(DEFAULT_TIMELINE_PRESETS);
}

export async function ensureDefaultCouriers() {
  const count = await Courier.countDocuments();
  if (count > 0) return;
  await Courier.insertMany(DEFAULT_COURIERS);
}

export async function ensureDefaultTimelinePresets() {
  const count = await TimelinePreset.countDocuments();
  if (count > 0) return;
  await TimelinePreset.insertMany(DEFAULT_TIMELINE_PRESETS);
}

export function buildTrackingUrl(template, trackingId) {
  if (!template || !trackingId) return null;
  const id = encodeURIComponent(String(trackingId).trim());
  return template.replace(/\{id\}/g, id);
}

export async function getCourierLabelMap() {
  await ensureDefaultCouriers();
  const couriers = await Courier.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  const map = {};
  for (const c of couriers) {
    map[c.slug] = c.name;
  }
  return map;
}

export async function isValidCourierSlug(slug) {
  if (!slug) return false;
  await ensureDefaultCouriers();
  const found = await Courier.findOne({ slug: String(slug).toLowerCase().trim() });
  return Boolean(found);
}
