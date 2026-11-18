import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalUnit, normalizeIngredients, recipeStructureIssues } from './recipe-structure.js';

const complete = { defaultServings: 2, ingredients: [{ name: ' Basmati  Rice ', quantity: 1, unit: 'Cups' }], steps: ['Cook rice.'] };

test('a complete recipe has no structure issues and normalizes identity and units', () => {
  assert.deepEqual(recipeStructureIssues(complete), []);
  assert.deepEqual(normalizeIngredients(complete.ingredients), [{ name: 'Basmati  Rice', canonicalName: 'basmati rice', quantity: 1, unit: 'cup' }]);
  assert.equal(canonicalUnit('gms'), 'g');
  assert.equal(canonicalUnit('tbsp.'), 'tbsp');
});

test('ambiguous or unsupported quantities cannot enter grocery aggregation', () => {
  assert.equal(recipeStructureIssues({ ...complete, ingredients: [{ name: 'salt', quantity: 1, unit: 'to taste' }] }).length, 1);
  assert.equal(recipeStructureIssues({ ...complete, ingredients: [{ name: 'rice', quantity: 1, unit: 'bowl' }] }).length, 1);
  assert.equal(recipeStructureIssues({ ...complete, ingredients: [{ name: 'rice', quantity: 0, unit: 'cup' }] }).length, 1);
});

test('optional garnish may stay unmeasured, duplicates and empty methods are rejected', () => {
  assert.deepEqual(recipeStructureIssues({ ...complete, ingredients: [...complete.ingredients, { name: 'salt', quantity: 1, unit: 'to taste', optional: true }] }), []);
  assert.equal(recipeStructureIssues({ ...complete, ingredients: [...complete.ingredients, { name: 'basmati rice', quantity: 2, unit: 'cup' }] }).length, 1);
  assert.equal(recipeStructureIssues({ ...complete, steps: ['  '] }).length, 1);
});
