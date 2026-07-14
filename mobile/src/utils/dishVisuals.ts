import { cardGradients } from '../constants/theme';
import type { Recommendation } from '../types';

const KEYWORD_EMOJI: Array<[string, string]> = [
  // Longer/more specific keywords must come before substrings they contain (e.g. "pancake" before "cake").
  ['pancake', '🥞'], ['pizza', '🍕'], ['ramen', '🍜'], ['noodle', '🍜'], ['taco', '🌮'],
  ['burrito', '🌯'], ['sushi', '🍣'], ['burger', '🍔'], ['salad', '🥗'], ['bowl', '🥗'],
  ['dosa', '🫓'], ['idli', '🍚'], ['biryani', '🍛'], ['curry', '🍛'], ['pasta', '🍝'],
  ['dessert', '🍰'], ['cake', '🍰'], ['chicken', '🍗'], ['sandwich', '🥪'], ['sub', '🥪'],
  ['thai', '🍜'],
];

export function dishEmoji(rec: Pick<Recommendation, 'dish'>): string {
  const haystack = `${rec.dish.name} ${rec.dish.cuisine} ${rec.dish.category ?? ''}`.toLowerCase();
  const match = KEYWORD_EMOJI.find(([kw]) => haystack.includes(kw));
  return match?.[1] ?? '🍽️';
}

export function dishGradient(index: number): readonly [string, string] {
  const g = cardGradients[index % cardGradients.length];
  return [g[0], g[1]];
}

/**
 * Real Swiggy menu-item photo wins when a match was found; otherwise fall back to the
 * AI service's static Unsplash `image_url`; otherwise null (caller shows the emoji/gradient).
 * Mirrors the priority used by frontend/src/components/Recommendations.tsx.
 */
export function resolveDishImage(rec: Pick<Recommendation, 'image_url' | 'swiggy'>): string | null {
  return rec.swiggy?.item?.image_url || rec.image_url || null;
}
