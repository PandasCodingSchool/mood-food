import assert from 'node:assert/strict';
import test from 'node:test';
import { speechText } from './speech.js';

const day = { title: 'Aloo Paratha', servings: 4, steps: ['Knead the dough.', 'Boil the potatoes.'],
  ingredients: [{ name: 'wheat flour', quantity: 3, unit: 'cup', optional: false }, { name: 'potato', quantity: 4, unit: 'piece', optional: false },
    { name: 'ajwain', quantity: 0.5, unit: 'tsp', optional: false }, { name: 'salt', quantity: null, unit: 'to taste', optional: true }] };

test('ingredients are read with spoken units and the servings, in the cook\'s language', () => {
  assert.equal(speechText(day, 'en', 'ingredients'), 'Aloo Paratha, for 4. Ingredients: 3 cup wheat flour, 4 potato, 0.5 teaspoon ajwain, salt to taste (optional).');
  assert.equal(speechText({ ...day, title: 'आलू पराठा' }, 'hi', 'ingredients')?.startsWith('आलू पराठा, 4 लोगों के लिए. सामग्री: 3 कप wheat flour'), true);
  assert.match(speechText(day, 'ta', 'ingredients')!, /4 பேருக்கு\. தேவையான பொருட்கள்:/);
});

test('steps are numbered; out-of-range or empty parts say nothing', () => {
  assert.equal(speechText(day, 'hi', 'step', 1), 'चरण 2. Boil the potatoes.');
  assert.equal(speechText(day, 'en', 'step', 5), null);
  assert.equal(speechText({ ...day, ingredients: [] }, 'en', 'ingredients'), null);
  assert.equal(speechText(day, 'xx', 'step', 0), 'Step 1. Knead the dough.');
});
