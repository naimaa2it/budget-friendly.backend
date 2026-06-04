import { isPathaoConfigured } from './pathao.js';

/** Whether merchant/API credentials exist for automatic status sync for this courier. */
export function isCourierSyncConfigured(courier) {
  switch (courier) {
    case 'pathao':
      return isPathaoConfigured();
    default:
      return false;
  }
}

export function anyCourierSyncConfigured() {
  return isPathaoConfigured();
}

/** Exposed to admin UI — which couriers can use "Sync from Courier". */
export function getCourierSyncConfig() {
  const pathaoConfigured = isPathaoConfigured();
  return {
    pathao: { apiConfigured: pathaoConfigured },
    steadfast: { apiConfigured: false },
    redx: { apiConfigured: false },
    sundarban: { apiConfigured: false },
    other: { apiConfigured: false },
  };
}
