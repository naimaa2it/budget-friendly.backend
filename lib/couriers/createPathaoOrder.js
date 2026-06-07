const BASE_URL = process.env.PATHAO_BASE_URL || 'https://api-hermes.pathao.com';

const tokenCache = new Map();

async function getAccessToken(creds) {
  const cacheKey = `${creds.clientId}:${creds.username}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token;
  }

  const res = await fetch(`${BASE_URL}/aladdin/api/v1/issue-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      username: creds.username,
      password: creds.password,
      grant_type: 'password',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'Pathao authentication failed');
  }

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
  return data.access_token;
}

export async function testPathaoConnection(creds, storeConfig = {}) {
  await getAccessToken(creds);
  const storeId = storeConfig.pathaoStoreId || creds.storeId;
  if (!storeId) {
    throw new Error('Pathao store_id is required in integration settings');
  }
  return { ok: true, message: 'Pathao API connected successfully' };
}

export async function createPathaoOrder(creds, storeConfig, payload) {
  const token = await getAccessToken(creds);
  const storeId = Number(storeConfig.pathaoStoreId || creds.storeId);
  if (!storeId) throw new Error('Pathao store_id is required');

  const body = {
    store_id: storeId,
    merchant_order_id: payload.merchantOrderId,
    recipient_name: payload.recipientName,
    recipient_phone: payload.recipientPhone,
    recipient_address: payload.recipientAddress,
    delivery_type: Number(storeConfig.deliveryType || 48),
    item_type: Number(storeConfig.defaultItemType || 2),
    item_quantity: Number(payload.itemQuantity || 1),
    item_weight: Number(payload.weight || storeConfig.defaultWeight || 0.5),
    amount_to_collect: Math.round(Number(payload.codAmount || 0)),
    special_instruction: payload.note || '',
    item_description: payload.itemDescription || 'Parcel',
  };

  const res = await fetch(`${BASE_URL}/aladdin/api/v1/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error ||
      (Array.isArray(data?.errors) ? data.errors.join(', ') : null) ||
      'Pathao order creation failed';
    throw new Error(msg);
  }

  const info = data?.data || data;
  const consignmentId =
    info?.consignment_id || info?.consignmentId || info?.order_id || null;

  return {
    consignmentId: consignmentId ? String(consignmentId) : null,
    trackingUrl: consignmentId
      ? `https://merchant.pathao.com/courier/tracking?consignment_id=${consignmentId}`
      : null,
    raw: data,
  };
}
