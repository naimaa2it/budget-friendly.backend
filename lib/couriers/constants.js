export const COURIER_IDS = ['pathao', 'steadfast', 'redx', 'sundarban', 'other'];

export const COURIER_LABELS = {
  pathao: 'Pathao',
  steadfast: 'Steadfast',
  redx: 'RedX',
  sundarban: 'Sundarban Courier',
  other: 'Other',
};

export function defaultTrackingUrl(courier, trackingId) {
  if (!courier || !trackingId) return null;
  const id = encodeURIComponent(String(trackingId).trim());
  switch (courier) {
    case 'pathao':
      return `https://merchant.pathao.com/courier/tracking?consignment_id=${id}`;
    case 'steadfast':
      return `https://steadfast.com.bd/t/${id}`;
    case 'redx':
      return `https://redx.com.bd/track/${id}`;
    default:
      return null;
  }
}
