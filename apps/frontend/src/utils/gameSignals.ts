import type { GameSignals, GameType } from "../types";
import type { BudgetTier } from "../constants/budget";

// Builds a complete GameSignals payload from a partial one, so every game
// emits the same shape without repeating defaults.
export function buildGameSignals(
  partial: Partial<GameSignals> & { type: GameType },
): GameSignals {
  return {
    liked: [],
    disliked: [],
    cravings: [],
    cuisines: [],
    budgetTier: "moderate",
    dietPreference: "both",
    ...partial,
  };
}

// Derives a suggested budget tier from the budget tags of liked items
// (e.g. swiped cards or accepted wheel segments). Returns the modal tier,
// or "moderate" when there's no signal. Ties break toward the cheaper tier
// so we never over-suggest spend.
export function deriveBudgetTier(likedBudgetTags: string[]): BudgetTier {
  const counts: Record<BudgetTier, number> = {
    budget: 0,
    moderate: 0,
    splurge: 0,
  };
  for (const tag of likedBudgetTags) {
    if (tag === "budget" || tag === "moderate" || tag === "splurge") {
      counts[tag] += 1;
    }
  }
  const order: BudgetTier[] = ["budget", "moderate", "splurge"];
  let best: BudgetTier = "moderate";
  let bestCount = 0;
  for (const tier of order) {
    if (counts[tier] > bestCount) {
      best = tier;
      bestCount = counts[tier];
    }
  }
  return bestCount === 0 ? "moderate" : best;
}

// Most frequent string in a list (first-seen wins ties). Used for e.g.
// picking the dominant craving from accepted wheel segments.
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
