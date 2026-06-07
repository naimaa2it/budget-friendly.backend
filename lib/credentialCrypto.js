import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function getEncryptionKey() {
  const raw =
    process.env.CREDENTIALS_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    process.env.ADMIN_SECRET ||
    'yourhaat-dev-credentials-key';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

export function encryptJson(payload) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const json = JSON.stringify(payload ?? {});
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptJson(blob) {
  if (!blob) return {};
  try {
    const key = getEncryptionKey();
    const buf = Buffer.from(blob, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + 16);
    const data = buf.subarray(IV_LEN + 16);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return {};
  }
}

export function maskSecret(value, visible = 4) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= visible) return '••••';
  return `${'•'.repeat(Math.min(8, s.length - visible))}${s.slice(-visible)}`;
}
