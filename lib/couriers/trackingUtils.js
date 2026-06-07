export function extractTrackingIdFromUrl(courier, url) {
  if (!url) return null;
  const raw = String(url).trim();

  const steadfast = raw.match(/steadfast\.com\.bd\/t(?:l)?\/([^/?#&\s]+)/i);
  if (steadfast) return steadfast[1];

  const pathao = raw.match(/consignment_id=([^&]+)/i);
  if (pathao) return decodeURIComponent(pathao[1]);

  const redx = raw.match(/redx\.com\.bd\/track\/([^/?#&\s]+)/i);
  if (redx) return redx[1];

  if (courier === 'steadfast') {
    const tail = raw.split('/').filter(Boolean).pop();
    if (tail && /^[A-Z0-9]+$/i.test(tail)) return tail;
  }

  return null;
}

export function inferCourierFromUrl(url) {
  if (!url) return null;
  const raw = String(url).toLowerCase();
  if (raw.includes('steadfast.com.bd')) return 'steadfast';
  if (raw.includes('pathao.com') || raw.includes('merchant.pathao')) return 'pathao';
  if (raw.includes('redx.com.bd')) return 'redx';
  return null;
}
