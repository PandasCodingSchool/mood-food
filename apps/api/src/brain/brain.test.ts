import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestBody, suggestSchema } from './brain.controller.js';

test('suggest body maps the app fields to the intelligence names, dropping unset ones', () => {
  assert.deepEqual(suggestBody(suggestSchema.parse({})), {});
  assert.deepEqual(suggestBody(suggestSchema.parse({ swiggyAddressId: 'a1', slot: 'lunch', daytype: 'weekday', refresh: true })), {
    swiggy_address_id: 'a1', slot: 'lunch', daytype: 'weekday', refresh: true,
  });
});

test('suggest schema rejects unknown slots and out-of-range counts', () => {
  assert.equal(suggestSchema.safeParse({ slot: 'brunch' }).success, false);
  assert.equal(suggestSchema.safeParse({ count: 9 }).success, false);
});
