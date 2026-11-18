/**
 * Pure grocery-requirement engine: scales structured recipe versions to slot servings,
 * canonicalizes ingredient identity, converts compatible units, sums across days, separates
 * pantry staples, and keeps a source trace for every aggregate line. No I/O lives here.
 */
import { canonicalIngredientName, canonicalUnit, type RecipeIngredient } from './recipe-structure.js';

export type Dimension = 'mass' | 'volume' | 'piece' | 'clove' | 'bunch' | 'sprig';
export type LineKind = 'recipe' | 'pantry' | 'optional' | 'manual';
export type LineStatus = 'buy' | 'skipped' | 'already_have';
export type FreshnessGroup = 'buy_now' | 'buy_later';

/** Base unit per dimension: grams for mass, millilitres for volume, the unit itself for counts. */
const UNIT_FACTORS: Record<string, { dimension: Dimension; toBase: number }> = {
  g: { dimension: 'mass', toBase: 1 },
  kg: { dimension: 'mass', toBase: 1_000 },
  ml: { dimension: 'volume', toBase: 1 },
  l: { dimension: 'volume', toBase: 1_000 },
  tsp: { dimension: 'volume', toBase: 5 },
  tbsp: { dimension: 'volume', toBase: 15 },
  cup: { dimension: 'volume', toBase: 240 },
  piece: { dimension: 'piece', toBase: 1 },
  clove: { dimension: 'clove', toBase: 1 },
  bunch: { dimension: 'bunch', toBase: 1 },
  sprig: { dimension: 'sprig', toBase: 1 },
};

/** Staples most Indian kitchens already stock; households can add or remove items. */
export const DEFAULT_PANTRY = [
  'salt', 'sugar', 'water', 'oil', 'turmeric powder', 'red chilli powder', 'coriander powder', 'garam masala',
  'cumin seed', 'mustard seed', 'asafoetida',
] as const;

/** Ingredients that spoil within a few days, so they are bought close to the day they are cooked. */
const PERISHABLE = new Set([
  'chicken', 'mutton', 'fish', 'prawn', 'egg', 'paneer', 'tofu', 'curd', 'milk', 'cream', 'butter',
  'coriander leaf', 'coriander leaves', 'mint leaves', 'mint', 'curry leaves', 'spinach', 'methi', 'spring onion',
  'tomato', 'green chilli', 'lemon', 'cauliflower', 'cabbage', 'capsicum', 'mushroom', 'cucumber', 'banana',
]);

/**
 * Approximate grams per millilitre for dry staples measured by cup or spoon, so they are bought by weight
 * and merge with gram-measured uses (1 cup rice ≈ 200 g). Liquids stay in ml.
 */
const DRY_DENSITY_G_PER_ML: Record<string, number> = {
  rice: 0.83, 'basmati rice': 0.83, 'brown rice': 0.83, 'toor dal': 0.83, 'moong dal': 0.83, 'masoor dal': 0.83, 'chana dal': 0.83,
  'urad dal': 0.83, dal: 0.83, semolina: 0.7, rava: 0.7, sooji: 0.7, 'wheat flour': 0.5, atta: 0.5, flour: 0.5, maida: 0.5,
  besan: 0.38, 'gram flour': 0.38, sugar: 0.83, 'thick poha': 0.33, poha: 0.33, peanut: 0.6, 'green pea': 0.6, oat: 0.38,
};

/** Days ahead of the reference date beyond which perishables move to a later shop. */
export const BUY_LATER_AFTER_DAYS = 3;

const ALIASES: Record<string, string> = {
  chillies: 'chilli', chilies: 'chilli', chili: 'chilli', chilly: 'chilli',
  'coriander leaves': 'coriander leaves', 'curry leaves': 'curry leaves', 'mint leaves': 'mint leaves',
  eggs: 'egg', dhania: 'coriander leaves', hing: 'asafoetida', jeera: 'cumin seed', rai: 'mustard seed', haldi: 'turmeric powder',
};

/**
 * Identity key used for deduplication. Lowercases, collapses spaces, maps a few aliases, and singularizes
 * the final word, so “2 onions + 1 onion” merge while “spring onion” and “onion” stay distinct.
 */
export function ingredientKey(name: string): string {
  const base = canonicalIngredientName(name);
  if (ALIASES[base]) return ALIASES[base];
  const words = base.split(' ');
  const last = words.pop() ?? '';
  const aliased = ALIASES[last];
  const singular = aliased ?? (/(ss|us|is)$/.test(last) || last.length <= 3 || last === 'leaves' ? last
    : last.endsWith('oes') ? last.slice(0, -2)
      : last.endsWith('ies') ? `${last.slice(0, -3)}y`
        : last.endsWith('s') ? last.slice(0, -1) : last);
  return [...words, singular].join(' ');
}

export function unitInfo(unit: string): { unit: string; dimension: Dimension; toBase: number } | null {
  const canonical = canonicalUnit(unit);
  if (!canonical) return null;
  return { unit: canonical, ...UNIT_FACTORS[canonical] };
}

/** Converts a base quantity to a shopper-friendly unit (g→kg, ml→l) rounded to 2 decimals. */
export function displayQuantity(baseQuantity: number, dimension: Dimension): { quantity: number; unit: string } {
  const round = (value: number) => Math.round(value * 100) / 100;
  if (dimension === 'mass') return baseQuantity >= 1_000 ? { quantity: round(baseQuantity / 1_000), unit: 'kg' } : { quantity: round(baseQuantity), unit: 'g' };
  if (dimension === 'volume') return baseQuantity >= 1_000 ? { quantity: round(baseQuantity / 1_000), unit: 'l' } : { quantity: round(baseQuantity), unit: 'ml' };
  // Counts are bought whole.
  return { quantity: Math.ceil(round(baseQuantity)), unit: dimension };
}

export function isPerishable(key: string): boolean {
  return PERISHABLE.has(key) || [...PERISHABLE].some((item) => key.endsWith(` ${item}`));
}

export function effectivePantry(overrides: Array<{ canonicalName: string; inPantry: boolean }>): Set<string> {
  const pantry = new Set<string>(DEFAULT_PANTRY);
  for (const override of overrides) {
    const key = ingredientKey(override.canonicalName);
    if (override.inPantry) pantry.add(key); else pantry.delete(key);
  }
  return pantry;
}

export interface SlotRequirement {
  slotId: string;
  plannedFor: string;
  servings: number;
  recipeId: string;
  recipeTitle: string;
  recipeVersionId: string;
  defaultServings: number;
  ingredients: RecipeIngredient[];
}

export interface SourceTrace {
  slotId: string;
  plannedFor: string;
  recipeId: string;
  recipeTitle: string;
  recipeVersionId: string;
  ingredientName: string;
  /** Quantity as written in the recipe, before scaling. */
  recipeQuantity: number;
  recipeUnit: string;
  scale: number;
  /** Scaled quantity in the line's base unit (g, ml, or count). */
  baseQuantity: number;
}

export interface RequirementLine {
  key: string;
  displayName: string;
  dimension: Dimension | null;
  baseQuantity: number | null;
  quantity: number | null;
  unit: string | null;
  kind: LineKind;
  status: LineStatus;
  required: boolean;
  freshnessGroup: FreshnessGroup;
  /** True when the same ingredient appears in units that cannot be converted (e.g. cups and grams). */
  unitConflict: boolean;
  firstNeededOn: string;
  sources: SourceTrace[];
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Aggregates slot recipes into deduplicated, source-traced lines, ordered by kind then name. */
export function aggregateRequirements(slots: SlotRequirement[], pantry: Set<string>, referenceDate: string): RequirementLine[] {
  const lines = new Map<string, RequirementLine>();
  for (const slot of slots) {
    const scale = slot.servings / slot.defaultServings;
    for (const ingredient of slot.ingredients) {
      const key = ingredientKey(ingredient.canonicalName ?? ingredient.name);
      const unit = unitInfo(ingredient.unit);
      const density = unit?.dimension === 'volume' ? DRY_DENSITY_G_PER_ML[key] : undefined;
      const info = unit && density ? { unit: 'g', dimension: 'mass' as const, toBase: unit.toBase * density } : unit;
      const inPantry = pantry.has(key);
      // Unmeasured optional extras (“salt to taste”) are listed for reference, never quantified.
      const kind: LineKind = inPantry ? 'pantry' : ingredient.optional ? 'optional' : 'recipe';
      const lineId = `${key}|${info?.dimension ?? 'unmeasured'}`;
      const baseQuantity = info ? ingredient.quantity * scale * info.toBase : null;
      const trace: SourceTrace = {
        slotId: slot.slotId, plannedFor: slot.plannedFor, recipeId: slot.recipeId, recipeTitle: slot.recipeTitle, recipeVersionId: slot.recipeVersionId,
        ingredientName: ingredient.name, recipeQuantity: ingredient.quantity, recipeUnit: ingredient.unit, scale: Math.round(scale * 1_000) / 1_000,
        baseQuantity: baseQuantity === null ? 0 : Math.round(baseQuantity * 1_000) / 1_000,
      };
      const existing = lines.get(lineId);
      if (existing) {
        existing.sources.push(trace);
        if (existing.baseQuantity !== null && baseQuantity !== null) existing.baseQuantity += baseQuantity;
        // Required wins: one recipe needing it outweighs another treating it as optional.
        if (!ingredient.optional && existing.kind === 'optional') { existing.kind = 'recipe'; existing.required = true; existing.status = 'buy'; }
        if (slot.plannedFor < existing.firstNeededOn) existing.firstNeededOn = slot.plannedFor;
        continue;
      }
      lines.set(lineId, {
        key, displayName: key, dimension: info?.dimension ?? null, baseQuantity, quantity: null, unit: null, kind,
        status: kind === 'pantry' ? 'already_have' : kind === 'optional' && !info ? 'skipped' : 'buy',
        required: !ingredient.optional, freshnessGroup: 'buy_now', unitConflict: false, firstNeededOn: slot.plannedFor, sources: [trace],
      });
    }
  }

  const byKey = new Map<string, number>();
  for (const line of lines.values()) if (line.dimension) byKey.set(line.key, (byKey.get(line.key) ?? 0) + 1);
  for (const line of lines.values()) {
    line.unitConflict = (byKey.get(line.key) ?? 0) > 1;
    if (line.baseQuantity !== null && line.dimension) Object.assign(line, displayQuantity(line.baseQuantity, line.dimension), { baseQuantity: Math.round(line.baseQuantity * 1_000) / 1_000 });
    if (isPerishable(line.key) && daysBetween(referenceDate, line.firstNeededOn) >= BUY_LATER_AFTER_DAYS) line.freshnessGroup = 'buy_later';
  }
  const order: Record<LineKind, number> = { recipe: 0, optional: 1, manual: 2, pantry: 3 };
  return [...lines.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.key.localeCompare(b.key) || (a.dimension ?? '').localeCompare(b.dimension ?? ''));
}
