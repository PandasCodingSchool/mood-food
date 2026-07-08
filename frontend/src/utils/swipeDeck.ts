import type { SwipeItem, SwipeData } from "../types";

// Affinity score of a card against the swipe history: confirm what the user
// likes, avoid what they pass on.
export function affinityScore(item: SwipeItem, swipes: SwipeData[]): number {
  let score = 0;
  for (const s of swipes) {
    if (s.liked) {
      if (s.category === item.category) score += 2;
      if (s.cuisine === item.cuisine) score += 1;
    } else {
      if (s.category === item.category) score -= 2;
      if (s.vibe === item.vibe) score -= 1;
    }
  }
  return score;
}

// Reorders the remaining cards after each swipe. Serves the highest-affinity
// card next to confirm the emerging preference, but every `probeEvery`-th
// swipe serves the LOWEST-affinity card instead to probe breadth.
export function reorderDeck(
  remaining: SwipeItem[],
  swipes: SwipeData[],
  probeEvery = 4,
): SwipeItem[] {
  if (remaining.length <= 1 || swipes.length === 0) return remaining;
  const scored = remaining
    .map((item, i) => ({ item, score: affinityScore(item, swipes), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i); // stable
  const isProbe = swipes.length % probeEvery === 0;
  if (isProbe) {
    const lowest = scored[scored.length - 1];
    return [
      lowest.item,
      ...scored.slice(0, scored.length - 1).map((s) => s.item),
    ];
  }
  return scored.map((s) => s.item);
}
