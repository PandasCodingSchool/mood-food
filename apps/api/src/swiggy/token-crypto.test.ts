import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { decrypt, deriveKey, encrypt } from './token-crypto.js';

test('round-trips and detects tampering', () => {
  const key = deriveKey(randomBytes(32).toString('base64'));
  const sealed = encrypt('token-123', key, 'user-a');
  assert.ok(sealed.startsWith('v2.'));
  assert.equal(decrypt(sealed, key, 'user-a'), 'token-123');
  const bytes = Buffer.from(sealed.slice(3), 'base64url');
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => decrypt('v2.' + bytes.toString('base64url'), key, 'user-a'));
});

test('a ciphertext only decrypts for the user it was sealed for', () => {
  const key = deriveKey(randomBytes(32).toString('base64'));
  assert.throws(() => decrypt(encrypt('token-123', key, 'user-a'), key, 'user-b'));
});

test('still reads the v1 format', () => {
  const key = deriveKey(randomBytes(32).toString('base64'));
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update('legacy', 'utf8'), cipher.final()]);
  const v1 = Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
  assert.equal(decrypt(v1, key, 'any-user'), 'legacy');
});

test('accepts hex keys and requires a key', () => {
  assert.equal(deriveKey(randomBytes(32).toString('hex')).length, 32);
  assert.throws(() => deriveKey(undefined));
});
