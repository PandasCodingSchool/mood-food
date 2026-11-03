import assert from 'node:assert/strict';
import test from 'node:test';
import { friendlyAmount } from './recipe-assist.service.js';

test('impact amounts read like a shopping list, not converter output', () => {
  assert.equal(friendlyAmount(5, 'ml'), '1 tsp');
  assert.equal(friendlyAmount(22.5, 'ml'), '1½ tbsp');
  assert.equal(friendlyAmount(30, 'ml'), '2 tbsp');
  assert.equal(friendlyAmount(80, 'ml'), '5½ tbsp');
  assert.equal(friendlyAmount(120, 'ml'), '120 ml');
  assert.equal(friendlyAmount(298.8, 'g'), '300 g');
  assert.equal(friendlyAmount(199.2, 'g'), '200 g');
  assert.equal(friendlyAmount(1250, 'g'), '1.3 kg');
  assert.equal(friendlyAmount(2, 'piece'), '2 piece');
});
