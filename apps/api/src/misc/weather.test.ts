import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weatherFrom } from './context.controller.js';

test('maps WMO codes and heat to app weather', () => {
  assert.equal(weatherFrom(63, 25), 'rainy');
  assert.equal(weatherFrom(73, 0), 'cold');
  assert.equal(weatherFrom(0, 22), 'sunny');
  assert.equal(weatherFrom(0, 34), 'hot');
  assert.equal(weatherFrom(3, 22), 'any');
  assert.equal(weatherFrom(undefined, undefined), 'any');
});
