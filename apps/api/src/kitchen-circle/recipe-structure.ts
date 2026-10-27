/**
 * Structured-recipe rules shared by recipe authoring, slot selection, and grocery eligibility.
 * A version is only grocery-eligible when every required ingredient has a canonical identity,
 * a positive quantity, and a unit Phase 4 can scale and convert.
 */

export interface RecipeIngredient {
  name: string;
  canonicalName?: string;
  quantity: number;
  unit: string;
  optional?: boolean;
}

export interface RecipeStructureInput {
  defaultServings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
}

/** Canonical unit → accepted spellings. Grouped by dimension for Phase 4 conversion. */
const UNIT_ALIASES: Record<string, string[]> = {
  g: ['g', 'gm', 'gms', 'gram', 'grams'],
  kg: ['kg', 'kgs', 'kilogram', 'kilograms'],
  ml: ['ml', 'millilitre', 'milliliter', 'millilitres', 'milliliters'],
  l: ['l', 'litre', 'liter', 'litres', 'liters'],
  tsp: ['tsp', 'teaspoon', 'teaspoons'],
  tbsp: ['tbsp', 'tablespoon', 'tablespoons'],
  cup: ['cup', 'cups'],
  piece: ['piece', 'pieces', 'pc', 'pcs', 'nos', 'no', 'whole', 'unit', 'units'],
  clove: ['clove', 'cloves'],
  bunch: ['bunch', 'bunches'],
  sprig: ['sprig', 'sprigs'],
};

export const RECIPE_UNITS = Object.keys(UNIT_ALIASES);

/** Phrases that make a quantity unmeasurable, so it cannot be aggregated into a grocery list. */
const AMBIGUOUS_UNITS = new Set(['to taste', 'as needed', 'as required', 'some', 'handful', 'pinch', 'dash', 'little']);

const UNIT_LOOKUP = new Map(Object.entries(UNIT_ALIASES).flatMap(([canonical, aliases]) => aliases.map((alias) => [alias, canonical] as const)));

export function canonicalUnit(unit: string): string | null {
  return UNIT_LOOKUP.get(unit.trim().toLowerCase().replace(/\.$/, '')) ?? null;
}

export function canonicalIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Returns human-readable problems; an empty array means the version is structurally complete. */
export function recipeStructureIssues(input: RecipeStructureInput): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(input.defaultServings) || input.defaultServings < 1) issues.push('Default servings must be a positive whole number.');
  if (!input.ingredients.length) issues.push('Add at least one ingredient.');
  if (!input.steps.some((step) => step.trim())) issues.push('Add at least one method step.');
  const seen = new Set<string>();
  for (const ingredient of input.ingredients) {
    const name = canonicalIngredientName(ingredient.canonicalName ?? ingredient.name);
    const label = ingredient.name.trim() || 'Unnamed ingredient';
    if (!name) issues.push('Every ingredient needs a name.');
    else if (seen.has(name)) issues.push(`“${label}” is listed more than once.`);
    seen.add(name);
    if (!(ingredient.quantity > 0) || !Number.isFinite(ingredient.quantity)) issues.push(`“${label}” needs a quantity greater than zero.`);
    const unit = ingredient.unit.trim().toLowerCase();
    if (AMBIGUOUS_UNITS.has(unit)) {
      if (!ingredient.optional) issues.push(`“${label}” uses “${ingredient.unit}”, which cannot be measured for groceries. Use a unit such as tsp, g, or piece.`);
    } else if (!canonicalUnit(unit)) {
      issues.push(`“${label}” uses an unsupported unit “${ingredient.unit}”. Use one of: ${RECIPE_UNITS.join(', ')}.`);
    }
  }
  return issues;
}

/** Normalizes ingredient identities and units for storage. Call only after `recipeStructureIssues` is empty. */
export function normalizeIngredients(ingredients: RecipeIngredient[]): RecipeIngredient[] {
  return ingredients.map((ingredient) => ({
    name: ingredient.name.trim(),
    canonicalName: canonicalIngredientName(ingredient.canonicalName ?? ingredient.name),
    quantity: ingredient.quantity,
    unit: canonicalUnit(ingredient.unit) ?? ingredient.unit.trim().toLowerCase(),
    ...(ingredient.optional ? { optional: true } : {}),
  }));
}
