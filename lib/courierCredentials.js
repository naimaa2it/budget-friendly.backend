import Courier from '../models/Courier.js';
import { decryptJson, encryptJson, maskSecret } from './credentialCrypto.js';

const INTEGRATION_SLUGS = new Set(['pathao', 'steadfast', 'redx']);

export function isIntegrationSlug(slug) {
  return INTEGRATION_SLUGS.has(String(slug || '').toLowerCase());
}

function envCredentialsForSlug(slug) {
  const s = String(slug).toLowerCase();
  if (s === 'pathao') {
    const creds = {
      clientId: process.env.PATHAO_CLIENT_ID || '',
      clientSecret: process.env.PATHAO_CLIENT_SECRET || '',
      username: process.env.PATHAO_USERNAME || '',
      password: process.env.PATHAO_PASSWORD || '',
      storeId: process.env.PATHAO_STORE_ID || '',
    };
    return Object.values(creds).some(Boolean) ? creds : null;
  }
  if (s === 'steadfast') {
    const creds = {
      apiKey: process.env.STEADFAST_API_KEY || '',
      secretKey: process.env.STEADFAST_SECRET_KEY || '',
      email: process.env.STEADFAST_EMAIL || '',
      password: process.env.STEADFAST_PASSWORD || '',
      baseUrl: process.env.STEADFAST_BASE_URL || 'https://portal.packzy.com/api/v1',
    };
    return creds.apiKey && creds.secretKey ? creds : null;
  }
  if (s === 'redx') {
    const creds = {
      apiToken: process.env.REDX_API_TOKEN || '',
      baseUrl: process.env.REDX_BASE_URL || 'https://openapi.redx.com.bd/v1.0.0-beta',
      phone: process.env.REDX_PHONE || '',
      password: process.env.REDX_PASSWORD || '',
    };
    return creds.apiToken || (creds.phone && creds.password) ? creds : null;
  }
  return null;
}

export function credentialsConfigured(slug, creds, storeConfig = {}) {
  const s = String(slug).toLowerCase();
  if (!creds) return false;
  if (s === 'pathao') {
    return Boolean(
      creds.clientId &&
        creds.clientSecret &&
        creds.username &&
        creds.password &&
        (storeConfig.pathaoStoreId || creds.storeId),
    );
  }
  if (s === 'steadfast') {
    return Boolean(creds.apiKey && creds.secretKey);
  }
  if (s === 'redx') {
    return Boolean(
      creds.apiToken ||
        (creds.phone && creds.password),
    );
  }
  return false;
}

export async function getCourierDocBySlug(slug) {
  return Courier.findOne({ slug: String(slug).toLowerCase() }).lean();
}

export async function getCourierIntegration(slug) {
  const doc = await getCourierDocBySlug(slug);
  const storeConfig = doc?.storeConfig || {};
  let creds = null;
  let source = 'none';

  if (doc?.credentialsEncrypted) {
    creds = decryptJson(doc.credentialsEncrypted);
    if (Object.keys(creds).length) source = 'database';
  }

  if (!credentialsConfigured(slug, creds, storeConfig)) {
    const envCreds = envCredentialsForSlug(slug);
    if (envCreds) {
      creds = { ...envCreds, ...(creds || {}) };
      if (credentialsConfigured(slug, creds, storeConfig)) {
        source = source === 'database' ? 'database+env' : 'env';
      }
    }
  }

  if (creds?.storeId && !storeConfig.pathaoStoreId) {
    storeConfig.pathaoStoreId = Number(creds.storeId) || creds.storeId;
  }

  const hasAnyCreds = creds && Object.values(creds).some((v) => v !== '' && v != null);

  return {
    slug,
    doc,
    creds: hasAnyCreds ? creds : null,
    storeConfig,
    apiEnabled: Boolean(doc?.apiEnabled),
    capabilities: doc?.capabilities || {
      fraudCheck: true,
      trackingSync: true,
      parcelCreate: true,
    },
    integrationStatus: doc?.integrationStatus || null,
    source,
    configured: credentialsConfigured(slug, creds, storeConfig),
    fraudConfigured: fraudCredentialsReady(slug, creds),
  };
}

export function fraudCredentialsReady(slug, creds) {
  if (!creds) return false;
  const s = String(slug).toLowerCase();
  if (s === 'pathao') return Boolean(creds.username && creds.password);
  if (s === 'steadfast') return Boolean(creds.email && creds.password);
  if (s === 'redx') return Boolean((creds.phone && creds.password) || creds.apiToken);
  return false;
}

export function maskCredentialsForSlug(slug, creds = {}) {
  const s = String(slug).toLowerCase();
  if (s === 'pathao') {
    return {
      clientId: creds.clientId ? maskSecret(creds.clientId) : '',
      clientSecret: creds.clientSecret ? maskSecret(creds.clientSecret) : '',
      username: creds.username ? maskSecret(creds.username, 3) : '',
      password: creds.password ? maskSecret(creds.password) : '',
      storeId: creds.storeId ? String(creds.storeId) : '',
      hasClientId: Boolean(creds.clientId),
      hasClientSecret: Boolean(creds.clientSecret),
      hasUsername: Boolean(creds.username),
      hasPassword: Boolean(creds.password),
      hasStoreId: Boolean(creds.storeId),
    };
  }
  if (s === 'steadfast') {
    return {
      apiKey: creds.apiKey ? maskSecret(creds.apiKey) : '',
      secretKey: creds.secretKey ? maskSecret(creds.secretKey) : '',
      email: creds.email || '',
      password: creds.password ? maskSecret(creds.password) : '',
      baseUrl: creds.baseUrl || '',
      hasApiKey: Boolean(creds.apiKey),
      hasSecretKey: Boolean(creds.secretKey),
      hasEmail: Boolean(creds.email),
      hasPassword: Boolean(creds.password),
    };
  }
  if (s === 'redx') {
    return {
      apiToken: creds.apiToken ? maskSecret(creds.apiToken) : '',
      baseUrl: creds.baseUrl || '',
      phone: creds.phone || '',
      password: creds.password ? maskSecret(creds.password) : '',
      hasApiToken: Boolean(creds.apiToken),
      hasPhone: Boolean(creds.phone),
      hasPassword: Boolean(creds.password),
    };
  }
  return {};
}

export function mergeCredentialUpdates(slug, existing = {}, incoming = {}) {
  const merged = { ...existing };
  const s = String(slug).toLowerCase();

  const secretFields =
    s === 'pathao'
      ? ['clientId', 'clientSecret', 'username', 'password', 'storeId']
      : s === 'steadfast'
        ? ['apiKey', 'secretKey', 'email', 'password', 'baseUrl']
        : s === 'redx'
          ? ['apiToken', 'baseUrl', 'phone', 'password']
          : [];

  for (const key of secretFields) {
    if (incoming[key] !== undefined && incoming[key] !== '' && incoming[key] !== null) {
      merged[key] = incoming[key];
    }
  }
  return merged;
}

export async function saveCourierCredentials(courierId, { apiEnabled, credentials, storeConfig, capabilities }) {
  const courier = await Courier.findById(courierId);
  if (!courier) return null;

  if (typeof apiEnabled === 'boolean') courier.apiEnabled = apiEnabled;

  if (credentials && isIntegrationSlug(courier.slug)) {
    const existing = decryptJson(courier.credentialsEncrypted);
    const merged = mergeCredentialUpdates(courier.slug, existing, credentials);
    courier.credentialsEncrypted = encryptJson(merged);
  }

  if (storeConfig && typeof storeConfig === 'object') {
    courier.storeConfig = { ...(courier.storeConfig?.toObject?.() || courier.storeConfig || {}), ...storeConfig };
  }

  if (capabilities && typeof capabilities === 'object') {
    courier.capabilities = { ...(courier.capabilities?.toObject?.() || courier.capabilities || {}), ...capabilities };
  }

  await courier.save();
  return courier;
}

export async function listBookableCouriers() {
  const slugs = ['pathao', 'steadfast', 'redx'];
  const items = [];
  for (const slug of slugs) {
    const integration = await getCourierIntegration(slug);
    const doc = integration.doc;
    if (
      integration.configured &&
      doc?.apiEnabled === true &&
      integration.capabilities?.parcelCreate !== false
    ) {
      items.push({
        slug,
        name: doc?.name || slug,
        storeConfig: integration.storeConfig,
        capabilities: integration.capabilities,
      });
    }
  }
  return items;
}
