function baseUrl(storeConfig, creds) {
  return (
    storeConfig.redxBaseUrl ||
    creds.baseUrl ||
    'https://openapi.redx.com.bd/v1.0.0-beta'
  ).replace(/\/$/, '');
}

export async function getRedxToken(creds) {
  if (creds.apiToken) return creds.apiToken;

  const phone = String(creds.phone || '').replace(/\D/g, '');
  const normalized = phone.startsWith('880') ? phone : phone.startsWith('0') ? `88${phone}` : `880${phone}`;

  const res = await fetch('https://api.redx.com.bd/v4/auth/login', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({
      phone: normalized,
      password: creds.password,
    }),
  });

  const data = await res.json().catch(() => ({}));
  const token = data?.data?.accessToken;
  if (!res.ok || !token) {
    throw new Error(data?.message || 'RedX login failed');
  }
  return token;
}

export async function testRedxConnection(creds, storeConfig = {}) {
  const token = await getRedxToken(creds);
  const url = `${baseUrl(storeConfig, creds)}/areas`;
  const res = await fetch(url, {
    headers: {
      'API-ACCESS-TOKEN': `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || 'RedX connection failed');
  }
  return { ok: true, message: 'RedX API connected', areasCount: data?.areas?.length || 0 };
}

export async function fetchRedxAreas(creds, storeConfig = {}, { districtName } = {}) {
  const token = await getRedxToken(creds);
  const base = baseUrl(storeConfig, creds);
  const query = districtName
    ? `?district_name=${encodeURIComponent(districtName)}`
    : '';
  const res = await fetch(`${base}/areas${query}`, {
    headers: {
      'API-ACCESS-TOKEN': `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch RedX areas');
  return data?.areas || [];
}

export async function createRedxOrder(creds, storeConfig, payload) {
  const token = await getRedxToken(creds);
  const areaId =
    payload.deliveryAreaId ||
    storeConfig.redxDeliveryAreaId;
  const areaName =
    payload.deliveryAreaName ||
    storeConfig.redxDeliveryAreaName ||
    payload.recipientCity ||
    'Dhaka';

  if (!areaId) {
    throw new Error('RedX delivery_area_id is required — set in courier settings or book modal');
  }

  const body = {
    customer_name: payload.recipientName,
    customer_phone: payload.recipientPhone,
    delivery_area: areaName,
    delivery_area_id: Number(areaId),
    customer_address: payload.recipientAddress,
    merchant_invoice_id: payload.merchantOrderId,
    cash_collection_amount: String(Math.round(Number(payload.codAmount || 0))),
    parcel_weight: Math.round(Number(payload.weightGrams || (payload.weight || 0.5) * 1000)),
    instruction: payload.note || '',
    value: Math.round(Number(payload.declaredValue || payload.codAmount || 0)),
    pickup_store_id: storeConfig.pickupStoreId || undefined,
    parcel_details_json: [
      {
        name: payload.itemDescription || 'Order items',
        category: 'general',
        value: Math.round(Number(payload.declaredValue || payload.codAmount || 0)),
      },
    ],
  };

  const res = await fetch(`${baseUrl(storeConfig, creds)}/parcel`, {
    method: 'POST',
    headers: {
      'API-ACCESS-TOKEN': `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'RedX parcel creation failed');
  }

  const trackingId = data?.tracking_id || data?.data?.tracking_id;
  return {
    consignmentId: trackingId ? String(trackingId) : null,
    trackingUrl: trackingId ? `https://redx.com.bd/track/${trackingId}` : null,
    raw: data,
  };
}
