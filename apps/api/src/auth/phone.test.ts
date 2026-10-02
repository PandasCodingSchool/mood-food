import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePhone } from './phone.js';

test('normalizes Indian number formats to one E.164 value', () => {
  for (const raw of ['9876543210', '+91 98765 43210', '098765-43210', '+919876543210', ' (+91) 98765 43210 ']) {
    assert.equal(normalizePhone(raw, 'IN'), '+919876543210', raw);
  }
});

test('keeps foreign numbers with a country code', () => {
  assert.equal(normalizePhone('+1 415 555 2671', 'IN'), '+14155552671');
});

test('rejects junk', () => {
  for (const raw of ['', '123', 'abcdefghij', '12345678901234567890123', null, 42]) {
    assert.equal(normalizePhone(raw, 'IN'), null, String(raw));
  }
});
