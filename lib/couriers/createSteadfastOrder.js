function baseUrl(storeConfig, creds) {
  return (
    storeConfig.steadfastBaseUrl ||
    creds.baseUrl ||
    'https://portal.packzy.com/api/v1'
  ).replace(/\/$/, '');
}

export async function testSteadfastConnection(creds, storeConfig = {}) {
  const url = `${baseUrl(storeConfig, creds)}/get_balance`;
  const res = await fetch(url, {
    headers: {
      'Api-Key': creds.apiKey,
      'Secret-Key': creds.secretKey,
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'Steadfast connection failed');
  }
  return { ok: true, message: 'Steadfast API connected', balance: data?.current_balance };
}

export async function createSteadfastOrder(creds, storeConfig, payload) {
  const url = `${baseUrl(storeConfig, creds)}/create_order`;
  const body = {
    invoice: payload.merchantOrderId,
    recipient_name: payload.recipientName,
    recipient_phone: payload.recipientPhone,
    recipient_address: payload.recipientAddress.slice(0, 250),
    cod_amount: Math.round(Number(payload.codAmount || 0)),
    note: payload.note || '',
    item_description: payload.itemDescription || 'Parcel',
    total_lot: Number(payload.itemQuantity || 1),
    delivery_type: 0,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Api-Key': creds.apiKey,
      'Secret-Key': creds.secretKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status && Number(data.status) >= 400) {
    throw new Error(data?.message || data?.error || 'Steadfast order creation failed');
  }

  const consignment = data?.consignment || data?.data?.consignment || {};
  const trackingCode = consignment.tracking_code || consignment.trackingCode;
  const consignmentId = consignment.consignment_id || consignment.consignmentId;

  return {
    consignmentId: trackingCode
      ? String(trackingCode)
      : consignmentId
        ? String(consignmentId)
        : null,
    trackingUrl: trackingCode ? `https://steadfast.com.bd/t/${trackingCode}` : null,
    raw: data,
  };
}
