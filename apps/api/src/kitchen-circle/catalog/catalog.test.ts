import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalUnit, recipeStructureIssues, type RecipeIngredient } from '../recipe-structure.js';

interface CatalogRecipe {
  slug: string; title: string; recipe_id: string; version_id: string; default_servings: number;
  dietary_tags: string[]; allergens: string[]; ingredients: RecipeIngredient[]; steps: string[];
  effort: string; freshness_class: string; prep_minutes: number; cook_minutes: number;
}

const catalog = JSON.parse(readFileSync(new URL('./catalog-recipes.json', import.meta.url), 'utf8')) as { recipes: CatalogRecipe[] };
const migration = readFileSync(new URL('../../../drizzle/0020_kitchen_circle_catalog_v2.sql', import.meta.url), 'utf8');

// Mirrors the intelligence service's allergen words (apps/intelligence/app/kitchen_circle/recipe_ai.py).
const ALLERGEN_WORDS: Record<string, string[]> = {
  dairy: ['milk', 'curd', 'yogurt', 'paneer', 'ghee', 'butter', 'cream', 'cheese'],
  gluten: ['wheat', 'atta', 'maida', 'semolina', 'rava', 'bread', 'noodles', 'pav'],
  peanut: ['peanut', 'peanuts', 'groundnut'],
  nuts: ['cashew', 'cashews', 'almond', 'almonds', 'pistachio', 'walnut'],
  egg: ['egg', 'eggs'],
  shellfish: ['prawn', 'prawns', 'shrimp', 'crab'],
  soy: ['soy', 'tofu'],
  sesame: ['sesame'],
};
const PLANT_DAIRY = ['coconut', 'almond', 'soy', 'oat', 'cashew', 'peanut', 'cocoa', 'rice'];
const MEAT = ['chicken', 'mutton', 'fish', 'prawn', 'prawns', 'kingfish', 'lamb'];
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]+/g) ?? []);

test('the catalog is large, unique, and every recipe is in the seed migration', () => {
  assert.ok(catalog.recipes.length >= 60);
  assert.equal(new Set(catalog.recipes.map((r) => r.title.toLowerCase())).size, catalog.recipes.length);
  assert.equal(new Set(catalog.recipes.map((r) => r.recipe_id)).size, catalog.recipes.length);
  for (const r of catalog.recipes) {
    assert.ok(migration.includes(`'${r.recipe_id}'`) && migration.includes(`'${r.version_id}'`), r.title);
  }
});

test('every catalog recipe is grocery-ready with canonical units', () => {
  for (const r of catalog.recipes) {
    assert.deepEqual(recipeStructureIssues({ defaultServings: r.default_servings, ingredients: r.ingredients, steps: r.steps }), [], r.title);
    for (const i of r.ingredients) assert.equal(canonicalUnit(i.unit), i.unit, `${r.title}: ${i.name}`);
    assert.ok(['easy', 'medium', 'involved'].includes(r.effort) && ['pantry', 'fresh', 'perishable'].includes(r.freshness_class), r.title);
    assert.ok(r.steps.length >= 2 && r.prep_minutes + r.cook_minutes > 0, r.title);
  }
});

test('allergens and diet tags match the ingredients', () => {
  for (const r of catalog.recipes) {
    const names = r.ingredients.map((i) => words(i.name));
    for (const [allergen, list] of Object.entries(ALLERGEN_WORDS)) {
      const present = names.some((n) => list.some((w) => n.has(w)) && !(allergen === 'dairy' && PLANT_DAIRY.some((w) => n.has(w))));
      if (present) assert.ok(r.allergens.includes(allergen), `${r.title} is missing allergen ${allergen}`);
    }
    const meat = names.some((n) => MEAT.some((w) => n.has(w)));
    const egg = r.allergens.includes('egg');
    if (meat) assert.ok(r.dietary_tags.includes('non_vegetarian') && !r.dietary_tags.includes('vegetarian'), r.title);
    else if (egg) assert.ok(r.dietary_tags.includes('eggetarian') && !r.dietary_tags.includes('vegetarian'), r.title);
    else assert.ok(r.dietary_tags.includes('vegetarian'), r.title);
    if (r.dietary_tags.includes('vegan')) assert.ok(!r.allergens.some((a) => ['dairy', 'egg', 'shellfish'].includes(a)), `${r.title} cannot be vegan`);
    if (r.dietary_tags.includes('gluten_free')) assert.ok(!r.allergens.includes('gluten'), `${r.title} cannot be gluten free`);
  }
});
