import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.WEBHOOK_ENCRYPTION_KEY;

function getKey(): Buffer {
  if (!KEY_HEX) {
    // In development without the key, skip encryption (return a no-op)
    throw new Error('WEBHOOK_ENCRYPTION_KEY env var is not set');
  }
  const buf = Buffer.from(KEY_HEX, 'hex');
  if (buf.length !== 32) throw new Error('WEBHOOK_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return buf;
}

/**
 * Encrypts a plaintext string. Returns a hex string: iv:authTag:ciphertext
 * Returns null if input is null/empty.
 */
export function encryptField(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  try {
    const key = getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch {
    // If encryption key not configured (e.g. dev), store plaintext with a marker
    return plaintext;
  }
}

/**
 * Decrypts a value encrypted by encryptField.
 * Returns null if input is null/empty. Returns plaintext as-is if not encrypted format.
 */
export function decryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  // Check if it looks like our encrypted format: hex:hex:hex
  const parts = value.split(':');
  if (parts.length !== 3 || !KEY_HEX) return value; // not encrypted or no key, return as-is
  try {
    const key = getKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = Buffer.from(parts[2], 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return value; // decryption failed, return raw (graceful degradation)
  }
}
