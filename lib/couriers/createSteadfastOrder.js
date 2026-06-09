const STEADFAST_API_BASE = "https://portal.packzy.com/api/v1";

function baseUrl(storeConfig, creds) {
  const raw =
    storeConfig.steadfastBaseUrl || creds.baseUrl || STEADFAST_API_BASE;
  const url = String(raw).trim().replace(/\/$/, "");
  if (!url.includes("packzy.com")) return STEADFAST_API_BASE;
  return url;
}

function steadfastAuthHeaders(creds) {
  return {
    "Api-Key": String(creds.apiKey || "").trim(),
    "Secret-Key": String(creds.secretKey || "").trim(),
  };
}

function isSteadfastAccountInactive(text) {
  return /account is not active/i.test(String(text || ""));
}

function steadfastHttpError(text, status, data = null) {
  const fromJson =
    data && typeof data === "object"
      ? [data.message, data.error, data.errors].flat().filter(Boolean).join(" ")
      : "";
  const combined = `${text || ""} ${fromJson}`;
  const snippet = String(text || fromJson)
    .trim()
    .slice(0, 200)
    .replace(/\s+/g, " ");

  if (isSteadfastAccountInactive(combined)) {
    return (
      "Steadfast merchant account সক্রিয় নয় (Account is not active). API Key/Secret ঠিক আছে — " +
      "Test connection balance check পাস করতে পারে, কিন্তু parcel book করতে merchant account Steadfast দিয়ে activate/approve করতে হবে। " +
      "steadfast.com.bd merchant panel এ login করে account status visit, অথবা Steadfast support (09678-045045) এ যোগাযোগ করুন।"
    );
  }

  if (status === 401) {
    return `Steadfast authentication failed (HTTP 401). API Key/Secret Key যাচাই করুন।${snippet ? ` (${snippet})` : ""}`;
  }

  return `Steadfast API error (HTTP ${status}).${snippet ? ` ${snippet}` : ""}`;
}

function parseSteadfastError(data, statusCode) {
  if (!data || typeof data !== "object") {
    return `Steadfast API error (HTTP ${statusCode})`;
  }
  const parts = [];
  if (data.message) parts.push(String(data.message));
  if (data.error) parts.push(String(data.error));
  if (Array.isArray(data.errors)) {
    parts.push(
      data.errors
        .map((e) => (typeof e === "string" ? e : JSON.stringify(e)))
        .join("; "),
    );
  } else if (data.errors && typeof data.errors === "object") {
    parts.push(
      Object.entries(data.errors)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("; "),
    );
  }
  if (data.status && Number(data.status) >= 400 && data.status !== statusCode) {
    parts.push(`status ${data.status}`);
  }
  const message =
    parts.filter(Boolean).join(" — ") ||
    `Steadfast order failed (HTTP ${statusCode})`;
  if (isSteadfastAccountInactive(message)) {
    return steadfastHttpError(message, statusCode, data);
  }
  return message;
}

export function steadfastInvoiceFromOrderId(orderId) {
  const raw = String(orderId || "").replace(/[^a-zA-Z0-9]/g, "");
  return `YH${raw}`.slice(0, 40);
}

export async function steadfastFraudCheck(creds, storeConfig, phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const normalized = digits.startsWith("880") ? digits.slice(2) : digits;
  const url = `${baseUrl(storeConfig, creds)}/fraud_check/${normalized}`;
  const res = await fetch(url, {
    headers: { ...steadfastAuthHeaders(creds), Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseSteadfastError(data, res.status));
  }
  const delivered = Number(data.total_delivered ?? data.success ?? 0);
  const cancelled = Number(data.total_cancelled ?? data.cancel ?? 0);
  const total = Number(
    data.total_parcels ?? data.total ?? delivered + cancelled,
  );
  return { delivered, cancelled, total, raw: data };
}

export async function testSteadfastConnection(creds, storeConfig = {}) {
  const url = `${baseUrl(storeConfig, creds)}/get_balance`;
  const res = await fetch(url, {
    headers: { ...steadfastAuthHeaders(creds), Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseSteadfastError(data, res.status));
  }
  return {
    ok: true,
    message:
      "Steadfast API connected (balance check OK). Parcel book করতে merchant account Steadfast দিয়ে active/approved থাকতে হবে।",
    balance: data?.current_balance,
  };
}

export async function createSteadfastOrder(creds, storeConfig, payload) {
  const url = `${baseUrl(storeConfig, creds)}/create_order`;
  const invoice =
    payload.merchantOrderId?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) ||
    steadfastInvoiceFromOrderId(payload.orderId);

  const body = {
    invoice,
    recipient_name: String(payload.recipientName || "").slice(0, 100),
    recipient_phone: String(payload.recipientPhone || "")
      .replace(/\D/g, "")
      .slice(-11),
    recipient_address: String(payload.recipientAddress || "").slice(0, 250),
    cod_amount: Number(payload.codAmount || 0),
    note: String(payload.note || "").slice(0, 250),
    item_description: String(payload.itemDescription || "Parcel").slice(0, 250),
    total_lot: Number(payload.itemQuantity || 1),
    delivery_type: 0,
  };

  const auth = steadfastAuthHeaders(creds);
  if (!auth["Api-Key"] || !auth["Secret-Key"]) {
    throw new Error(
      "Steadfast API Key and Secret Key are missing. Save them in Shipment Settings.",
    );
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  console.log("=== STEADFAST DEBUG ===");
  console.log("HTTP STATUS:", res.status);
  console.log("RAW:", text);
  console.log("=======================");

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    console.log("JSON PARSE FAILED — see RAW above");
    throw new Error(steadfastHttpError(text, res.status));
  }

  const bodyStatus = Number(data?.status);
  console.log("BODY:", data);

  if (!res.ok || (bodyStatus && bodyStatus >= 400)) {
    throw new Error(parseSteadfastError(data, res.status));
  }

  const consignment =
    data?.consignment || data?.data?.consignment || data?.data || {};
  const trackingCode = consignment.tracking_code || consignment.trackingCode;
  const consignmentId = consignment.consignment_id || consignment.consignmentId;

  if (!trackingCode && !consignmentId) {
    throw new Error(
      parseSteadfastError(data, res.status) ||
        "Steadfast accepted request but no tracking code returned",
    );
  }

  return {
    consignmentId: trackingCode ? String(trackingCode) : String(consignmentId),
    trackingUrl: trackingCode
      ? `https://steadfast.com.bd/t/${trackingCode}`
      : null,
    raw: data,
  };
}
