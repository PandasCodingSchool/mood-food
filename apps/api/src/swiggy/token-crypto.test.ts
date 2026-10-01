import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { decrypt, deriveKey, encrypt } from './token-crypto.js';

test('round-trips and detects tampering', () => {
  const key = deriveKey(randomBytes(32).toString('base64'));
  const sealed = encrypt('token-123', key);
  assert.equal(decrypt(sealed, key), 'token-123');
  const bytes = Buffer.from(sealed, 'base64url');
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => decrypt(bytes.toString('base64url'), key));
});

test('accepts hex keys and requires a key', () => {
  assert.equal(deriveKey(randomBytes(32).toString('hex')).length, 32);
  assert.throws(() => deriveKey(undefined));
});
