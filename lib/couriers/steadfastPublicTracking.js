const STEADFAST_ORIGIN = "https://steadfast.com.bd";
const USER_AGENT = "Mozilla/5.0 (compatible; Pickob-Tracker/1.0)";

function storeCookies(jar, setCookieHeaders) {
  for (const line of setCookieHeaders) {
    const part = String(line).split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) {
      jar[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  }
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function decodeXsrfToken(jar) {
  const raw = jar["XSRF-TOKEN"];
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function mapTrackingRow(row) {
  const message =
    row?.text ||
    row?.message ||
    row?.description ||
    row?.note ||
    row?.status_text ||
    row?.status ||
    "Status update";

  const atRaw =
    row?.created_at ||
    row?.updated_at ||
    row?.time ||
    row?.timestamp ||
    row?.at ||
    null;

  return {
    status: String(row?.status || row?.type || "update"),
    message: String(message).trim(),
    at: atRaw ? new Date(atRaw) : new Date(),
    source: "courier",
  };
}

function eventsFromPayload(data) {
  const candidates = [
    data?.trackings,
    data?.tracking_history,
    data?.logs,
    data?.activities,
    data?.result?.trackings,
    data?.consignment?.trackings,
  ];

  const events = [];
  for (const arr of candidates) {
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      const mapped = mapTrackingRow(row);
      if (mapped.message) events.push(mapped);
    }
  }

  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  return events;
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": USER_AGENT,
      ...headers,
    },
  });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return res.json().catch(() => null);
}

async function fetchSteadfastTl(trackingCode) {
  const data = await fetchJson(
    `${STEADFAST_ORIGIN}/tl/${encodeURIComponent(trackingCode)}`,
  );
  if (!data) return null;

  const events = eventsFromPayload(data);
  if (!events.length) return null;

  const latest = events[events.length - 1];
  return {
    configured: true,
    courierStatus: latest.message,
    events,
    raw: data,
  };
}

async function fetchSteadfastBypass(trackingCode) {
  const jar = {};

  await fetch(`${STEADFAST_ORIGIN}/t/${encodeURIComponent(trackingCode)}`, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  }).then((visit) => {
    storeCookies(jar, visit.headers.getSetCookie?.() || []);
  });

  const data = await fetchJson(
    `${STEADFAST_ORIGIN}/user/tracking/bypass/${encodeURIComponent(trackingCode)}`,
    {
      Referer: `${STEADFAST_ORIGIN}/t/${trackingCode}`,
      Cookie: cookieHeader(jar),
      "X-XSRF-TOKEN": decodeXsrfToken(jar),
    },
  );

  if (!data) return null;
  if (data?.status === "otp_required") return { otpRequired: true };

  const events = eventsFromPayload(data);
  if (!events.length && Number(data?.status) === 0) return null;

  const latest = events[events.length - 1];
  const consignmentStatus =
    data?.result?.status ||
    data?.result?.delivery_status ||
    latest?.message ||
    null;

  return {
    configured: true,
    courierStatus: consignmentStatus ? String(consignmentStatus) : null,
    events,
    raw: data,
  };
}

/**
 * Fetches timeline from steadfast.com.bd public APIs (same data as live tracking page).
 */
export async function fetchSteadfastPublicTracking(trackingCode) {
  const code = String(trackingCode || "").trim();
  if (!code) {
    return { configured: true, courierStatus: null, events: [] };
  }

  const bypass = await fetchSteadfastBypass(code);
  if (bypass?.events?.length) return bypass;

  const tl = await fetchSteadfastTl(code);
  if (tl?.events?.length) return tl;

  return {
    configured: true,
    courierStatus: bypass?.courierStatus || tl?.courierStatus || null,
    events: [],
    otpRequired: bypass?.otpRequired || false,
  };
}

export function extractSteadfastEventsFromMerchantData(data) {
  return eventsFromPayload(data);
}
