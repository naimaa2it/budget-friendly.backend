const BASE_URL = process.env.PATHAO_BASE_URL || 'https://api-hermes.pathao.com';

let cachedToken = null;
let tokenExpiresAt = 0;

function isConfigured() {
  return Boolean(
    process.env.PATHAO_CLIENT_ID &&
      process.env.PATHAO_CLIENT_SECRET &&
      process.env.PATHAO_USERNAME &&
      process.env.PATHAO_PASSWORD,
  );
}

async function getAccessToken() {
  if (!isConfigured()) {
    throw new Error('Pathao API credentials are not configured.');
  }

  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const res = await fetch(`${BASE_URL}/aladdin/api/v1/issue-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PATHAO_CLIENT_ID,
      client_secret: process.env.PATHAO_CLIENT_SECRET,
      username: process.env.PATHAO_USERNAME,
      password: process.env.PATHAO_PASSWORD,
      grant_type: 'password',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'Pathao authentication failed.');
  }

  cachedToken = data.access_token;
  const expiresIn = Number(data.expires_in || 3600);
  tokenExpiresAt = Date.now() + expiresIn * 1000;
  return cachedToken;
}

const PATHAO_STATUS_MAP = {
  delivered: 'delivered',
  cancelled: 'cancelled',
  returned: 'cancelled',
  'return to merchant': 'cancelled',
};

export function mapPathaoStatusToOrderStatus(rawStatus) {
  if (!rawStatus) return null;
  const key = String(rawStatus).trim().toLowerCase();
  if (PATHAO_STATUS_MAP[key]) return PATHAO_STATUS_MAP[key];
  if (key.includes('deliver')) return 'delivered';
  if (key.includes('cancel') || key.includes('return')) return null;
  return 'shipped';
}

export async function fetchPathaoTracking(consignmentId) {
  if (!consignmentId) {
    throw new Error('Pathao consignment ID is required.');
  }

  if (!isConfigured()) {
    return {
      configured: false,
      courierStatus: null,
      events: [],
    };
  }

  const token = await getAccessToken();
  const res = await fetch(
    `${BASE_URL}/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}/info`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message || payload?.error || 'Pathao tracking request failed.');
  }

  const info = payload?.data || payload;
  const courierStatus =
    info?.order_status ||
    info?.order_status_slug ||
    info?.status ||
    null;

  const events = [];
  const statusTime = info?.updated_at || info?.status_updated_at || info?.created_at;
  if (courierStatus) {
    events.push({
      status: String(courierStatus),
      message: `Pathao: ${courierStatus}`,
      at: statusTime ? new Date(statusTime) : new Date(),
      source: 'courier',
    });
  }

  if (Array.isArray(info?.tracking_history)) {
    for (const row of info.tracking_history) {
      events.push({
        status: row?.status || row?.order_status || 'update',
        message: row?.message || row?.status || 'Status update',
        at: row?.time || row?.created_at ? new Date(row.time || row.created_at) : new Date(),
        source: 'courier',
      });
    }
  }

  return {
    configured: true,
    courierStatus: courierStatus ? String(courierStatus) : null,
    events,
    raw: info,
  };
}

export { isConfigured as isPathaoConfigured };
