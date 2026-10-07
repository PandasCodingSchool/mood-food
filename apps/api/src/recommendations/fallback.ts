// Offline fallback used when the intelligence service is down. Serves real
// catalog dishes (see fallback-dishes.ts, generated from the intelligence
// catalog) filtered by diet, allergies and budget — never an invented table.
import { randomInt } from 'node:crypto';
import { FALLBACK_DISHES, type FallbackDish } from './fallback-dishes.js';

export interface FallbackQuery {
  mood: string;
  craving: string;
  budget: string;
  preference: string;
  allergies?: string[];
}

const BUDGET_MAX: Record<string, number> = { budget: 300, moderate: 800, splurge: 2000 };

const ALLERGEN_ALIASES: Record<string, string> = {
  milk: 'dairy', lactose: 'dairy', egg: 'eggs', nut: 'nuts', peanut: 'nuts', peanuts: 'nuts',
  wheat: 'gluten', prawns: 'shellfish', shrimp: 'shellfish', seafood: 'shellfish',
};

const WHY: Record<string, (food: string) => string> = {
  happy: (f) => `Keeps the good mood going — ${f} is a reliable crowd-pleaser.`,
  tired: (f) => `Low effort, high comfort: ${f} when you're running on empty.`,
  stressed: (f) => `Something warm and familiar to help you unwind — ${f}.`,
  celebrating: (f) => `A little celebration on a plate: ${f}.`,
  relaxed: (f) => `Easy-going and satisfying — ${f} suits a relaxed evening.`,
  adventurous: (f) => `Feeling bold? ${f} is worth trying tonight.`,
};

function dietAllows(d: FallbackDish, preference: string): boolean {
  const p = preference.toLowerCase().replace(/[\s-]/g, '_');
  if (p === 'vegan') return d.dietary_tags.includes('vegan');
  if (p === 'veg' || p === 'vegetarian') return !d.dietary_tags.includes('non_veg');
  if (p === 'non_veg' || p === 'nonveg') return d.dietary_tags.includes('non_veg');
  return true;
}

function pickDistinct<T>(items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(randomInt(pool.length), 1)[0]);
  return out;
}

/** Three real dishes for the mood, shaped like intelligence recommendations. */
export function fallbackRecommendations(q: FallbackQuery) {
  const mood = q.mood.toLowerCase();
  const allergies = new Set((q.allergies ?? []).map((a) => ALLERGEN_ALIASES[a.toLowerCase()] ?? a.toLowerCase()));
  const safe = (d: FallbackDish) => dietAllows(d, q.preference) && !d.allergens.some((a) => allergies.has(a));
  const maxPrice = BUDGET_MAX[q.budget.toLowerCase()] ?? Infinity;

  const moodPool = FALLBACK_DISHES[mood] ?? FALLBACK_DISHES.happy;
  const everything = [...new Map(Object.values(FALLBACK_DISHES).flat().map((d) => [d.id, d])).values()];
  // Relax budget, then mood — never diet or allergies.
  const tiers = [
    moodPool.filter((d) => safe(d) && d.price_inr <= maxPrice),
    moodPool.filter(safe),
    everything.filter(safe),
  ];
  const pool = tiers.find((t) => t.length >= 3) ?? tiers[2];
  const why = WHY[mood] ?? WHY.happy;

  return pickDistinct(pool, 3).map((d, index) => ({
    id: `fb_${index}`,
    rank: index + 1,
    confidence: 0.5,
    dish: {
      id: d.id,
      name: d.name,
      cuisine: d.cuisine,
      category: d.category,
      tags: [...d.dietary_tags, ...d.mood_tags],
    },
    image_url: d.image_url,
    ai_reasoning: {
      mood_match: `A dependable pick for a ${q.mood} mood`,
      context_fit: 'Shown while personalised picks are briefly unavailable',
      psychological_hook: why(d.name),
    },
    practical_details: {
      estimated_price: d.price_inr,
      preparation_time: d.prep_time_min,
      calories: d.calories,
      health_score: d.health_score,
    },
    restaurant: null,
    alternatives: [],
    pairing_suggestions: [],
  }));
}
