// Central JWT secret accessor.
// Throws at import time if JWT_SECRET is not configured — forces an explicit
// misconfiguration error rather than silently signing tokens with a known fallback.
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Set it in .env before starting the server.');
}

export const JWT_SECRET = process.env.JWT_SECRET;
export default JWT_SECRET;
