import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;
const KEYLEN = 64;

/** `salt:hash` (hex), scrypt N=16384 — same format v1 used. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(secret, salt, KEYLEN);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const derived = await scryptAsync(secret, salt, KEYLEN);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

// Burned on unknown-phone logins so response time doesn't reveal registration.
const DUMMY = 'a'.repeat(32) + ':' + 'b'.repeat(128);
export const burnVerify = (secret: string) => verifySecret(secret, DUMMY).then(() => false);
