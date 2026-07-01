// Granular permission groups — shown as grouped checkboxes in the admin editor UI.
export const PERMISSION_GROUPS = [
  {
    groupKey: 'dashboard',
    label: 'Dashboard',
    permissions: [
      { key: 'dashboard.view', label: 'View dashboard' },
    ],
  },
  {
    groupKey: 'orders',
    label: 'Orders',
    permissions: [
      { key: 'orders.view',      label: 'View orders' },
      { key: 'orders.manage',    label: 'Create & edit orders' },
      { key: 'orders.delete',    label: 'Delete orders' },
      { key: 'orders.returns',   label: 'Returns & refunds' },
      { key: 'orders.abandoned', label: 'Abandoned carts & checkouts' },
      { key: 'orders.wishlist',  label: 'View wishlist' },
      { key: 'orders.timeline',  label: 'Order timeline' },
      { key: 'orders.notes',     label: 'Customer notes' },
      { key: 'orders.pick',      label: 'Order pick' },
      { key: 'orders.courier',   label: 'Send orders to courier' },
    ],
  },
  {
    groupKey: 'products',
    label: 'Products',
    permissions: [
      { key: 'products.view',          label: 'View products' },
      { key: 'products.buying_price',  label: 'View buying price' },
      { key: 'products.manage',        label: 'Create & edit products' },
      { key: 'products.delete',        label: 'Delete products' },
      { key: 'products.inventory',     label: 'Manage inventory' },
      { key: 'products.variants',      label: 'Product variants' },
      { key: 'products.categories',    label: 'Categories' },
      { key: 'products.discounts',     label: 'Discounts & coupons' },
      { key: 'products.tags',          label: 'Tags & badges' },
      { key: 'products.barcodes',      label: 'Barcodes' },
      { key: 'products.reviews',       label: 'Reviews' },
      { key: 'products.rewards',       label: 'Rewards' },
      { key: 'products.waitlist',      label: 'Waitlist' },
      { key: 'products.questions',     label: 'Q & A' },
      { key: 'products.preorders',     label: 'Pre-orders' },
    ],
  },
  {
    groupKey: 'customers',
    label: 'Customers',
    permissions: [
      { key: 'customers.view',   label: 'View customers' },
      { key: 'customers.manage', label: 'Create & edit customers' },
      { key: 'customers.delete', label: 'Delete customers' },
      { key: 'customers.tags',   label: 'Customer tags' },
    ],
  },
  {
    groupKey: 'content',
    label: 'Online Store & Content',
    permissions: [
      { key: 'content.banners',  label: 'Banners & popups' },
      { key: 'content.promo',    label: 'Promo strip, occasions & panels' },
      { key: 'content.featured', label: 'Featured sections' },
      { key: 'content.blog',     label: 'Blog / content' },
      { key: 'content.media',    label: 'Media library' },
    ],
  },
  {
    groupKey: 'addons',
    label: 'Addons',
    permissions: [
      { key: 'addons.manage',     label: 'All addons overview' },
      { key: 'addons.pixels',     label: 'Pixels (Facebook, TikTok)' },
      { key: 'addons.analytics',  label: 'Analytics (GA4, GTM)' },
      { key: 'addons.adsense',    label: 'Google AdSense' },
      { key: 'addons.protection', label: 'Fake order protection' },
    ],
  },
  {
    groupKey: 'reports',
    label: 'Reports',
    permissions: [
      { key: 'reports.profit',    label: 'Profit margin' },
      { key: 'reports.analytics', label: 'Most searched & popular' },
    ],
  },
  {
    groupKey: 'system',
    label: 'System',
    permissions: [
      { key: 'system.settings', label: 'Website settings' },
      { key: 'system.policies', label: 'Policy pages' },
    ],
  },
];

const GRANULAR_KEYS = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key));

// Legacy section keys → all equivalent granular keys.
// Moderators saved with old broad keys keep full section access.
const LEGACY_MAP = {
  catalog: [
    'products.view', 'products.buying_price', 'products.manage', 'products.delete',
    'products.inventory', 'products.variants', 'products.categories', 'products.discounts',
    'products.tags', 'products.barcodes', 'products.reviews', 'products.rewards',
    'products.waitlist', 'products.questions', 'products.preorders',
  ],
  orders: [
    'orders.view', 'orders.manage', 'orders.delete', 'orders.returns',
    'orders.abandoned', 'orders.wishlist', 'orders.timeline', 'orders.notes',
    'orders.pick', 'orders.courier',
  ],
  customers: ['customers.view', 'customers.manage', 'customers.delete', 'customers.tags'],
  content: ['content.banners', 'content.promo', 'content.featured', 'content.blog', 'content.media'],
  addons: ['addons.manage', 'addons.pixels', 'addons.analytics', 'addons.adsense', 'addons.protection'],
};

// Granular key → legacy section key (auto-derived)
const REVERSE_MAP = Object.fromEntries(
  Object.entries(LEGACY_MAP).flatMap(([legacy, keys]) => keys.map(k => [k, legacy]))
);

export const PERMISSION_KEYS = [...Object.keys(LEGACY_MAP), ...GRANULAR_KEYS];

// Admins always have full access.
// Moderators must have a permission explicitly checked to gain access —
// empty permissions array means NO access (opt-in grant model).
// Supports both legacy section keys and new granular keys.
export function hasPermission(admin, key) {
  if (!admin) return false;
  if (admin.role === 'admin') return true;
  if (!Array.isArray(admin.permissions) || admin.permissions.length === 0) return false;

  if (admin.permissions.includes(key)) return true;

  // Legacy section key: accept if any equivalent granular key is present
  if (LEGACY_MAP[key]) return LEGACY_MAP[key].some(k => admin.permissions.includes(k));

  // Granular key: accept if the legacy section key is present
  if (REVERSE_MAP[key]) return admin.permissions.includes(REVERSE_MAP[key]);

  return false;
}

export function requirePermission(key) {
  return (req, res, next) => {
    if (!hasPermission(req.admin, key)) {
      return res.status(403).json({ error: 'You do not have permission to access this section' });
    }
    next();
  };
}

export function sanitizePermissions(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter(key => PERMISSION_KEYS.includes(key)))];
}
