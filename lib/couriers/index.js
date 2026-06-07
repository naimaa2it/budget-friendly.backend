import { fetchPathaoTracking, mapPathaoStatusToOrderStatus } from './pathao.js';
import { getCourierIntegration } from '../courierCredentials.js';

async function fetchSteadfastTracking(trackingId) {
  const integration = await getCourierIntegration('steadfast');
  if (!integration.configured || !integration.creds) {
    return { configured: false, courierStatus: null, events: [] };
  }

  const base = (
    integration.storeConfig?.steadfastBaseUrl ||
    integration.creds.baseUrl ||
    'https://portal.packzy.com/api/v1'
  ).replace(/\/$/, '');

  const res = await fetch(`${base}/status_by_trackingcode/${encodeURIComponent(trackingId)}`, {
    headers: {
      'Api-Key': integration.creds.apiKey,
      'Secret-Key': integration.creds.secretKey,
      Accept: 'application/json',
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || 'Steadfast tracking request failed');
  }

  const status = data?.delivery_status || data?.status || null;
  const events = status
    ? [
        {
          status: String(status),
          message: `Steadfast: ${status}`,
          at: new Date(),
          source: 'courier',
        },
      ]
    : [];

  return {
    configured: true,
    courierStatus: status ? String(status) : null,
    events,
    raw: data,
  };
}

async function fetchRedxTracking(trackingId) {
  const integration = await getCourierIntegration('redx');
  if (!integration.configured || !integration.creds) {
    return { configured: false, courierStatus: null, events: [] };
  }

  const { getRedxToken } = await import('./createRedxOrder.js');
  const token = await getRedxToken(integration.creds);
  const base = (
    integration.storeConfig?.redxBaseUrl ||
    integration.creds.baseUrl ||
    'https://openapi.redx.com.bd/v1.0.0-beta'
  ).replace(/\/$/, '');

  const res = await fetch(`${base}/parcel/track/${encodeURIComponent(trackingId)}`, {
    headers: {
      'API-ACCESS-TOKEN': `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || 'RedX tracking request failed');
  }

  const tracking = Array.isArray(data?.tracking) ? data.tracking : [];
  const latest = tracking[tracking.length - 1];
  const status = latest?.message_en || latest?.message_bn || null;
  const events = tracking.map((row) => ({
    status: row?.message_en || 'update',
    message: row?.message_en || row?.message_bn || 'Status update',
    at: row?.time ? new Date(row.time) : new Date(),
    source: 'courier',
  }));

  return {
    configured: true,
    courierStatus: status ? String(status) : null,
    events,
    raw: data,
  };
}

export async function fetchCourierTracking(courier, trackingId) {
  switch (courier) {
    case 'pathao':
      return fetchPathaoTracking(trackingId);
    case 'steadfast':
      return fetchSteadfastTracking(trackingId);
    case 'redx':
      return fetchRedxTracking(trackingId);
    default:
      return {
        configured: false,
        courierStatus: null,
        events: [],
      };
  }
}

export function mapCourierStatusToOrderStatus(courier, courierStatus) {
  switch (courier) {
    case 'pathao':
      return mapPathaoStatusToOrderStatus(courierStatus);
    default:
      if (!courierStatus) return null;
      const key = String(courierStatus).toLowerCase();
      if (key.includes('deliver')) return 'delivered';
      if (key.includes('cancel') || key.includes('return')) return 'cancelled';
      if (key.includes('transit') || key.includes('ship') || key.includes('pickup')) {
        return 'shipped';
      }
      return null;
  }
}
