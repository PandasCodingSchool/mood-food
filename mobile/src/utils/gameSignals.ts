import type { BudgetTier, GameSignals } from '../types';

// Builds a complete GameSignals payload from a partial one, so every game
// emits the same shape without repeating defaults. (Port of the web util.)
export function buildGameSignals(
  partial: Partial<GameSignals> & { type: string },
): GameSignals {
  return {
    liked: [],
    disliked: [],
    cravings: [],
    cuisines: [],
    budgetTier: 'moderate',
    dietPreference: 'both',
    ...partial,
  };
}

// Derives a suggested budget tier from the budget tags of liked items.
// Modal tier; ties break toward the cheaper tier so we never over-suggest spend.
export function deriveBudgetTier(likedBudgetTags: string[]): BudgetTier {
  const counts: Record<BudgetTier, number> = {
    budget: 0,
    moderate: 0,
    splurge: 0,
  };
  for (const tag of likedBudgetTags) {
    if (tag === 'budget' || tag === 'moderate' || tag === 'splurge') {
      counts[tag] += 1;
    }
  }
  const order: BudgetTier[] = ['budget', 'moderate', 'splurge'];
  let best: BudgetTier = 'moderate';
  let bestCount = 0;
  for (const tier of order) {
    if (counts[tier] > bestCount) {
      best = tier;
      bestCount = counts[tier];
    }
  }
  return bestCount === 0 ? 'moderate' : best;
}

// Most frequent string in a list (first-seen wins ties).
export function mostFrequent(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  let best: string | undefined;
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}
