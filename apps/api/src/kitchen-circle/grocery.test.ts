import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateRequirements, displayQuantity, effectivePantry, ingredientKey, type SlotRequirement } from './grocery.js';

const slot = (plannedFor: string, title: string, servings: number, defaultServings: number, ingredients: SlotRequirement['ingredients']): SlotRequirement => ({
  slotId: `slot-${plannedFor}`, plannedFor, servings, recipeId: `recipe-${title}`, recipeTitle: title, recipeVersionId: `version-${title}`, defaultServings, ingredients,
});
const pantry = effectivePantry([]);

test('ingredient identity merges plurals and aliases but keeps meaningful distinctions', () => {
  assert.equal(ingredientKey('Onions'), 'onion');
  assert.equal(ingredientKey('tomatoes'), 'tomato');
  assert.equal(ingredientKey('Green Chillies'), 'green chilli');
  assert.equal(ingredientKey('coriander leaves'), 'coriander leaves');
  assert.notEqual(ingredientKey('spring onion'), ingredientKey('onion'));
  assert.notEqual(ingredientKey('bone-in chicken'), ingredientKey('boneless chicken'));
});

test('2 onions + 1 onion = 3 onions, and 500 g + 750 g + 400 g chicken = 1.65 kg', () => {
  const lines = aggregateRequirements([
    slot('2026-11-02', 'Curry', 2, 2, [{ name: 'onions', quantity: 2, unit: 'piece' }, { name: 'chicken', quantity: 500, unit: 'g' }]),
    slot('2026-11-03', 'Biryani', 2, 2, [{ name: 'onion', quantity: 1, unit: 'pcs' }, { name: 'chicken', quantity: 0.75, unit: 'kg' }]),
    slot('2026-11-04', 'Tikka', 2, 2, [{ name: 'chicken', quantity: 400, unit: 'gms' }, { name: 'spring onion', quantity: 1, unit: 'bunch' }]),
  ], pantry, '2026-11-02');
  const onion = lines.find((line) => line.key === 'onion');
  const chicken = lines.find((line) => line.key === 'chicken');
  assert.deepEqual([onion?.quantity, onion?.unit, onion?.sources.length], [3, 'piece', 2]);
  assert.deepEqual([chicken?.quantity, chicken?.unit, chicken?.baseQuantity, chicken?.sources.length], [1.65, 'kg', 1_650, 3]);
  assert.ok(lines.some((line) => line.key === 'spring onion'));
});

test('recipes are scaled by slot servings and liquid volumes convert to millilitres', () => {
  const [milk] = aggregateRequirements([
    slot('2026-11-02', 'Kheer', 4, 2, [{ name: 'milk', quantity: 1, unit: 'cup' }]),
    slot('2026-11-03', 'Chai', 2, 4, [{ name: 'milk', quantity: 2, unit: 'tbsp' }]),
  ], pantry, '2026-11-02');
  // 1 cup × 2 = 480 ml, 2 tbsp × 0.5 = 15 ml.
  assert.deepEqual([milk.quantity, milk.unit, milk.sources.map((s) => s.scale)], [495, 'ml', [2, 0.5]]);
});

test('dry staples measured by volume are bought by weight and merge with gram measures', () => {
  const lines = aggregateRequirements([
    slot('2026-11-02', 'Pulao', 2, 2, [{ name: 'basmati rice', quantity: 1.5, unit: 'cup' }]),
    slot('2026-11-03', 'Biryani', 2, 2, [{ name: 'basmati rice', quantity: 500, unit: 'g' }]),
  ], pantry, '2026-11-02');
  assert.equal(lines.length, 1);
  // 1.5 cup × 240 ml × 0.83 g/ml = 298.8 g, + 500 g.
  assert.deepEqual([lines[0].quantity, lines[0].unit, lines[0].unitConflict], [798.8, 'g', false]);
});

test('pantry staples are listed but excluded, optional unmeasured extras are skipped, and unit conflicts are flagged', () => {
  const lines = aggregateRequirements([
    slot('2026-11-02', 'Dal', 2, 2, [{ name: 'salt', quantity: 1, unit: 'tsp' }, { name: 'coriander', quantity: 1, unit: 'to taste', optional: true }, { name: 'ghee', quantity: 1, unit: 'tbsp' }]),
    slot('2026-11-03', 'Dal fry', 2, 2, [{ name: 'ghee', quantity: 20, unit: 'g' }]),
  ], pantry, '2026-11-02');
  const salt = lines.find((line) => line.key === 'salt');
  assert.deepEqual([salt?.kind, salt?.status], ['pantry', 'already_have']);
  const coriander = lines.find((line) => line.key === 'coriander');
  assert.deepEqual([coriander?.kind, coriander?.status, coriander?.quantity], ['optional', 'skipped', null]);
  // Ghee has no declared density, so millilitres and grams stay separate and are flagged.
  const ghee = lines.filter((line) => line.key === 'ghee');
  assert.equal(ghee.length, 2);
  assert.ok(ghee.every((line) => line.unitConflict));
  assert.ok(!effectivePantry([{ canonicalName: 'salt', inPantry: false }]).has('salt'));
  assert.ok(effectivePantry([{ canonicalName: 'Ghee', inPantry: true }]).has('ghee'));
});

test('perishables needed three or more days out move to a later shop', () => {
  const lines = aggregateRequirements([
    slot('2026-11-02', 'Bhurji', 2, 2, [{ name: 'paneer', quantity: 200, unit: 'g' }]),
    slot('2026-11-06', 'Curry', 2, 2, [{ name: 'chicken', quantity: 500, unit: 'g' }, { name: 'rice', quantity: 1, unit: 'cup' }]),
  ], pantry, '2026-11-02');
  const group = (key: string) => lines.find((line) => line.key === key)?.freshnessGroup;
  assert.deepEqual([group('paneer'), group('chicken'), group('rice')], ['buy_now', 'buy_later', 'buy_now']);
  assert.deepEqual(displayQuantity(2.5, 'piece'), { quantity: 3, unit: 'piece' });
});
