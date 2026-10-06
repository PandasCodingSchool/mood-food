import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const V2 = 'v2.';

/** Accepts a 32-byte key as base64 or hex; anything else is stretched with scrypt (dev only). */
export function deriveKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error('Missing SWIGGY_TOKEN_ENCRYPTION_KEY (32-byte key, base64 or hex).');
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === KEY_LENGTH) return b64;
  const hex = Buffer.from(raw, 'hex');
  if (hex.length === KEY_LENGTH) return hex;
  return scryptSync(raw, 'moodfood-swiggy-salt', KEY_LENGTH);
}

/**
 * AES-256-GCM; output is `v2.` + base64url(iv | tag | ciphertext). `context`
 * (the owning user id) is bound as associated data, so a ciphertext copied
 * onto another user's row fails to decrypt.
 */
export function encrypt(text: string, key: Buffer, context: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return V2 + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

/** Also reads the unprefixed v1 format (no associated data) written before v2. */
export function decrypt(payload: string, key: Buffer, context: string): string {
  const v2 = payload.startsWith(V2);
  const buf = Buffer.from(v2 ? payload.slice(V2.length) : payload, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, IV_LENGTH));
  if (v2) decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([decipher.update(buf.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString('utf8');
}
