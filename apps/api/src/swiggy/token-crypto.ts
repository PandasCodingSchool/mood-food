import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/** Accepts a 32-byte key as base64 or hex; anything else is stretched with scrypt (dev only). */
export function deriveKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error('Missing SWIGGY_TOKEN_ENCRYPTION_KEY (32-byte key, base64 or hex).');
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === KEY_LENGTH) return b64;
  const hex = Buffer.from(raw, 'hex');
  if (hex.length === KEY_LENGTH) return hex;
  return scryptSync(raw, 'moodfood-swiggy-salt', KEY_LENGTH);
}

/** AES-256-GCM; output is base64url(iv | tag | ciphertext). */
export function encrypt(text: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

export function decrypt(payload: string, key: Buffer): string {
  const buf = Buffer.from(payload, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, IV_LENGTH));
  decipher.setAuthTag(buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([decipher.update(buf.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString('utf8');
}
