import { getCourierIntegration } from '../courierCredentials.js';

/** Whether merchant/API credentials exist for automatic status sync for this courier. */
function apiActive(integration) {
  if (integration.source === 'env' || integration.source === 'database+env') return true;
  return integration.doc?.apiEnabled === true;
}

export async function isCourierSyncConfigured(courier) {
  const integration = await getCourierIntegration(courier);
  if (!integration.configured || !apiActive(integration)) return false;
  if (integration.capabilities?.trackingSync === false) return false;
  return ['pathao', 'steadfast', 'redx'].includes(String(courier).toLowerCase());
}

export async function anyCourierSyncConfigured() {
  for (const slug of ['pathao', 'steadfast', 'redx']) {
    if (await isCourierSyncConfigured(slug)) return true;
  }
  return false;
}

/** Exposed to admin UI — which couriers can use "Sync from Courier". */
export async function getCourierSyncConfig() {
  const slugs = ['pathao', 'steadfast', 'redx', 'sundarban', 'other'];
  const out = {};
  for (const slug of slugs) {
    const integration = await getCourierIntegration(slug);
    out[slug] = {
      apiConfigured: integration.configured && integration.apiEnabled !== false,
      parcelCreate:
        integration.configured &&
        integration.apiEnabled !== false &&
        integration.capabilities?.parcelCreate !== false,
      fraudCheck: integration.configured && integration.capabilities?.fraudCheck !== false,
    };
  }
  return out;
}
