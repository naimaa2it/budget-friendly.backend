// Section-level permission keys a moderator account can be restricted to.
// These line up with the dashboard Sidebar's top-level sections so the UI
// and API enforcement stay in sync.
export const PERMISSION_KEYS = ['catalog', 'orders', 'customers', 'content', 'addons'];

export const PERMISSION_LABELS = {
  catalog: 'Catalog (Products, Variants, Discounts, Barcodes, Rewards, Waitlist…)',
  orders: 'Orders (incl. Returns, Abandoned Carts, Wishlist)',
  customers: 'Customers & Customer Tags',
  content: 'Marketing & Content (Banners, Popups, Blog, Media…)',
  addons: 'Addons (Pixels, Analytics…)',
};

// Admins always have full access. A moderator with no permissions assigned
// keeps today's behaviour (full access) — assigning permissions is an
// opt-in restriction, not an opt-in grant.
export function hasPermission(admin, key) {
  if (!admin) return false;
  if (admin.role === 'admin') return true;
  if (!Array.isArray(admin.permissions) || admin.permissions.length === 0) return true;
  return admin.permissions.includes(key);
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
  return [...new Set(input.filter((key) => PERMISSION_KEYS.includes(key)))];
}
