import crypto from 'crypto';

const MAGIC_LINK_TTL_MINUTES = 15;

export function createMagicTokenValue() {
  const secret = crypto.randomBytes(32).toString('hex');
  return secret;
}

export function hashMagicToken(rawToken: string) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function getMagicTokenExpiryDate() {
  return new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60_000);
}

export function getMagicTokenExpiresInMinutes() {
  return MAGIC_LINK_TTL_MINUTES;
}

export function buildMagicLoginUrl(rawToken: string) {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '');
  if (!baseUrl) return null;
  return `${baseUrl}/auth/magic?token=${encodeURIComponent(rawToken)}`;
}
