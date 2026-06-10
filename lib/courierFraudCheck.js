/**
 * Lifetime delivery stats by customer mobile from BD courier merchant panels
 * (Pathao, Steadfast, RedX). Not limited to yourHaat orders.
 * Credentials: dashboard courier integration first, then .env fallback.
 */

import { getCourierIntegration } from './courierCredentials.js';

const BD_MOBILE_RE = /^01[3-9][0-9]{8}$/;

const lifetimeCache = new Map();
const LIFETIME_CACHE_TTL_MS = Number(process.env.LIFETIME_STATS_CACHE_TTL_MS || 10 * 60 * 1000);

let pathaoMerchantToken = null;
let pathaoMerchantTokenKey = '';
let pathaoMerchantTokenAt = 0;
class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  ingest(response) {
    const list =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];
    for (const raw of list) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

export function normalizeBdMobile(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('880')) digits = digits.slice(3);
  if (digits.startsWith('88') && digits.length === 13) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;
  return digits;
}

export function isValidBdMobile(phone) {
  return BD_MOBILE_RE.test(normalizeBdMobile(phone));
}

function fraudCredsReady(slug, creds) {
  if (!creds) return false;
  const s = String(slug).toLowerCase();
  if (s === 'pathao') return Boolean(creds.username && creds.password);
  if (s === 'steadfast') {
    return Boolean(
      (creds.apiKey && creds.secretKey) || (creds.email && creds.password),
    );
  }
  if (s === 'redx') return Boolean((creds.phone && creds.password) || creds.apiToken);
  return false;
}

async function isFraudConfigured(slug) {
  const integration = await getCourierIntegration(slug);
  if (integration.capabilities?.fraudCheck === false) return false;
  return integration.fraudConfigured || fraudCredsReady(slug, integration.creds);
}

function emptyCourierResult() {
  return {
    delivered: 0,
    cancelled: 0,
    total: 0,
    successRate: 0,
    configured: false,
    available: false,
  };
}

function buildCourierResult({ delivered, cancelled, total, configured, error }) {
  const successRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
  return {
    delivered,
    cancelled,
    total,
    successRate,
    configured,
    available: !error,
    ...(error ? { error } : {}),
  };
}

async function getPathaoMerchantToken(creds) {
  const cacheKey = `${creds.username}`;
  if (
    pathaoMerchantToken &&
    pathaoMerchantTokenKey === cacheKey &&
    Date.now() - pathaoMerchantTokenAt < 50 * 60 * 1000
  ) {
    return pathaoMerchantToken;
  }

  const res = await fetch('https://merchant.pathao.com/api/v1/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      username: creds.username,
      password: creds.password,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data?.message || 'Pathao merchant login failed');
  }

  pathaoMerchantToken = String(data.access_token).trim();
  pathaoMerchantTokenKey = cacheKey;
  pathaoMerchantTokenAt = Date.now();
  return pathaoMerchantToken;
}

async function fetchPathaoLifetimeStats(phone) {
  const integration = await getCourierIntegration('pathao');
  if (!(await isFraudConfigured('pathao'))) {
    return emptyCourierResult();
  }

  try {
    const token = await getPathaoMerchantToken(integration.creds);
    const res = await fetch('https://merchant.pathao.com/api/v1/user/success', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone }),
    });

    const data = await res.json().catch(() => ({}));
    console.log('[Pathao fraud check] phone:', phone, 'status:', res.status, 'raw:', JSON.stringify(data));

    if (!res.ok) {
      return buildCourierResult({
        delivered: 0,
        cancelled: 0,
        total: 0,
        configured: true,
        error: data?.message || 'Pathao customer lookup failed',
      });
    }

    // Try multiple known response structures
    const customer = data?.data?.customer ?? data?.customer ?? data?.data ?? data ?? {};
    const delivered = Number(
      customer?.successful_delivery ?? customer?.success_delivery ??
      customer?.delivered ?? customer?.total_delivered ?? 0
    );
    const total = Number(
      customer?.total_delivery ?? customer?.total ?? customer?.total_parcels ?? 0
    );
    const cancelled = Math.max(0, total - delivered);

    console.log('[Pathao fraud check] parsed → delivered:', delivered, 'total:', total);

    return buildCourierResult({
      delivered,
      cancelled,
      total,
      configured: true,
    });
  } catch (err) {
    return buildCourierResult({
      delivered: 0,
      cancelled: 0,
      total: 0,
      configured: true,
      error: err.message || 'Pathao request failed',
    });
  }
}

async function fetchSteadfastLifetimeStats(phone) {
  const integration = await getCourierIntegration('steadfast');
  if (!(await isFraudConfigured('steadfast'))) {
    return emptyCourierResult();
  }
  const creds = integration.creds;

  if (creds.apiKey && creds.secretKey) {
    try {
      const { steadfastFraudCheck } = await import('./couriers/createSteadfastOrder.js');
      const result = await steadfastFraudCheck(creds, integration.storeConfig, phone);
      return buildCourierResult({
        delivered: result.delivered,
        cancelled: result.cancelled,
        total: result.total,
        configured: true,
      });
    } catch (err) {
      return buildCourierResult({
        delivered: 0,
        cancelled: 0,
        total: 0,
        configured: true,
        error: err.message || 'Steadfast fraud check failed',
      });
    }
  }

  try {
    const jar = new CookieJar();
    const loginPage = await fetch('https://steadfast.com.bd/login', {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    });
    jar.ingest(loginPage);
    const html = await loginPage.text();

    const tokenMatch = html.match(/<input type="hidden" name="_token" value="(.*?)"/);
    const csrfToken = tokenMatch?.[1];
    if (!csrfToken) {
      return buildCourierResult({
        delivered: 0,
        cancelled: 0,
        total: 0,
        configured: true,
        error: 'Steadfast CSRF token not found',
      });
    }

    const loginRes = await fetch('https://steadfast.com.bd/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: jar.header(),
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/html,application/json',
      },
      body: new URLSearchParams({
        _token: csrfToken,
        email: creds.email,
        password: creds.password,
      }),
      redirect: 'manual',
    });
    jar.ingest(loginRes);

    const fraudRes = await fetch(`https://steadfast.com.bd/user/frauds/check/${phone}`, {
      headers: {
        Cookie: jar.header(),
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const data = await fraudRes.json().catch(() => ({}));
    if (!fraudRes.ok) {
      return buildCourierResult({
        delivered: 0,
        cancelled: 0,
        total: 0,
        configured: true,
        error: data?.message || 'Steadfast fraud check failed',
      });
    }

    const delivered = Number(data.total_delivered || 0);
    const cancelled = Number(data.total_cancelled || 0);
    const total = delivered + cancelled;

    return buildCourierResult({
      delivered,
      cancelled,
      total,
      configured: true,
    });
  } catch (err) {
    return buildCourierResult({
      delivered: 0,
      cancelled: 0,
      total: 0,
      configured: true,
      error: err.message || 'Steadfast request failed',
    });
  }
}

async function fetchRedxLifetimeStats(phone) {
  const integration = await getCourierIntegration('redx');
  if (!(await isFraudConfigured('redx'))) {
    return emptyCourierResult();
  }

  try {
    const { getRedxToken } = await import('./couriers/createRedxOrder.js');
    const token = await getRedxToken(integration.creds);
    const res = await fetch(
      `https://redx.com.bd/api/redx_se/admin/parcel/customer-success-return-rate?phoneNumber=88${phone}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
      },
    );

    if (res.status === 401) {
      return buildCourierResult({
        delivered: 0,
        cancelled: 0,
        total: 0,
        configured: true,
        error: 'RedX token expired — retry',
      });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return buildCourierResult({
        delivered: 0,
        cancelled: 0,
        total: 0,
        configured: true,
        error: data?.message || 'RedX customer lookup failed',
      });
    }

    const delivered = Number(data?.data?.deliveredParcels || 0);
    const total = Number(data?.data?.totalParcels || 0);
    const cancelled = Math.max(0, total - delivered);

    return buildCourierResult({
      delivered,
      cancelled,
      total,
      configured: true,
    });
  } catch (err) {
    return buildCourierResult({
      delivered: 0,
      cancelled: 0,
      total: 0,
      configured: true,
      error: err.message || 'RedX request failed',
    });
  }
}

export function aggregateLifetimeStats(couriers = {}) {
  let totalDelivered = 0;
  let totalCancelled = 0;
  let totalParcels = 0;
  let configuredCount = 0;
  let availableCount = 0;

  for (const row of Object.values(couriers)) {
    if (row.configured) configuredCount += 1;
    if (row.available) availableCount += 1;
    totalDelivered += row.delivered || 0;
    totalCancelled += row.cancelled || 0;
    totalParcels += row.total || 0;
  }

  const completed = totalDelivered + totalCancelled;
  const deliverySuccessRate =
    completed > 0
      ? Math.round((totalDelivered / completed) * 100)
      : totalParcels > 0
        ? Math.round((totalDelivered / totalParcels) * 100)
        : 0;

  const cancellationRate =
    totalParcels > 0 ? Math.round((totalCancelled / totalParcels) * 100) : 0;

  let riskScore = 0;
  let riskLevel = 'low';
  let riskLabel = 'No courier data yet';
  const riskFactors = [];

  if (totalParcels > 0) {
    riskScore += cancellationRate * 0.45;
    riskScore += Math.max(0, 100 - deliverySuccessRate) * 0.35;
    if (totalParcels >= 5 && deliverySuccessRate < 40) riskScore += 15;
    if (totalCancelled >= 3 && totalDelivered === 0) riskScore += 20;
    riskScore = Math.min(100, Math.round(riskScore));

    riskLabel = 'Trusted — good delivery history';
    if (riskScore >= 65) {
      riskLevel = 'high';
      riskLabel = 'High risk — frequent cancellations';
    } else if (riskScore >= 35) {
      riskLevel = 'medium';
      riskLabel = 'Moderate risk — review before COD';
    }

    if (cancellationRate >= 30) {
      riskFactors.push(`High cancellation rate across couriers (${cancellationRate}%)`);
    }
    if (deliverySuccessRate < 50 && completed >= 3) {
      riskFactors.push(`Low lifetime delivery success (${deliverySuccessRate}%)`);
    }
    if (totalCancelled >= 5 && totalDelivered < totalCancelled) {
      riskFactors.push('More cancelled than delivered parcels');
    }
    if (!riskFactors.length) {
      riskFactors.push('No major risk signals from courier panels');
    }
  } else if (configuredCount > 0) {
    riskFactors.push('No parcel history found on configured courier panels');
  } else {
    riskFactors.push('No courier panels configured — add merchant credentials');
  }

  return {
    totalDelivered,
    totalCancelled,
    totalParcels,
    deliverySuccessRate,
    cancellationRate,
    risk: {
      score: riskScore,
      level: riskLevel,
      label: riskLabel,
      factors: riskFactors,
    },
    configuredCount,
    availableCount,
  };
}

export async function getLifetimeConfiguredCouriers() {
  const [pathao, steadfast, redx] = await Promise.all([
    isFraudConfigured('pathao'),
    isFraudConfigured('steadfast'),
    isFraudConfigured('redx'),
  ]);
  return { pathao, steadfast, redx };
}

export async function fetchLifetimeCourierStats(rawPhone, { skipCache = false } = {}) {
  const phone = normalizeBdMobile(rawPhone);
  if (!isValidBdMobile(phone)) {
    return {
      phone,
      valid: false,
      error: 'Invalid Bangladesh mobile. Use format 01XXXXXXXXX.',
      couriers: {},
      summary: aggregateLifetimeStats({}),
      configured: await getLifetimeConfiguredCouriers(),
      fetchedAt: new Date().toISOString(),
    };
  }

  const cacheKey = phone;
  if (!skipCache) {
    const cached = lifetimeCache.get(cacheKey);
    if (cached && Date.now() - cached.at < LIFETIME_CACHE_TTL_MS) {
      return { ...cached.data, cached: true };
    }
  }

  const [pathao, steadfast, redx] = await Promise.all([
    fetchPathaoLifetimeStats(phone),
    fetchSteadfastLifetimeStats(phone),
    fetchRedxLifetimeStats(phone),
  ]);

  const couriers = { pathao, steadfast, redx };
  const configured = await getLifetimeConfiguredCouriers();
  const anyConfigured = Object.values(configured).some(Boolean);

  const result = {
    phone,
    valid: true,
    source: 'courier_panels',
    description:
      'Lifetime parcel history for this mobile on Pathao, Steadfast, and RedX networks (all shops, not only yourHaat).',
    configured,
    anyConfigured,
    couriers,
    summary: aggregateLifetimeStats(couriers),
    fetchedAt: new Date().toISOString(),
    cached: false,
  };

  lifetimeCache.set(cacheKey, { at: Date.now(), data: result });
  return result;
}
