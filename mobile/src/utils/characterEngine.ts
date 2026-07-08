import { CHARACTERS, type CharacterProfile, type CharacterQuestionOption, type TraitKey, type TraitVector } from '../constants/characters';

const TRAIT_KEYS: TraitKey[] = ['energy', 'social', 'adventure', 'indulgence', 'spice', 'budget'];

function zeroVector(): TraitVector {
  return { energy: 0, social: 0, adventure: 0, indulgence: 0, spice: 0, budget: 0 };
}

export function buildUserVector(selections: CharacterQuestionOption[]): TraitVector {
  const vec = zeroVector();
  for (const opt of selections) {
    for (const key of TRAIT_KEYS) {
      const w = opt.traitWeights[key];
      if (typeof w === 'number') vec[key] += w;
    }
  }
  return vec;
}

function centered(v: TraitVector): number[] {
  const mean = TRAIT_KEYS.reduce((s, k) => s + v[k], 0) / TRAIT_KEYS.length;
  return TRAIT_KEYS.map((k) => v[k] - mean);
}

function correlation(a: TraitVector, b: TraitVector): number {
  const ca = centered(a);
  const cb = centered(b);
  const dot = ca.reduce((s, x, i) => s + x * cb[i], 0);
  const ma = Math.sqrt(ca.reduce((s, x) => s + x * x, 0));
  const mb = Math.sqrt(cb.reduce((s, x) => s + x * x, 0));
  if (ma === 0 || mb === 0) return 0;
  return dot / (ma * mb);
}

export interface CharacterMatchResult {
  character: CharacterProfile;
  matchPercent: number;
  runnerUps: Array<{ character: CharacterProfile; matchPercent: number }>;
}

export function matchCharacter(userVector: TraitVector): CharacterMatchResult {
  const toPercent = (s: number) => Math.max(60, Math.min(99, Math.round(78 + s * 21)));
  const scored = CHARACTERS.map((c) => ({ character: c, score: correlation(userVector, c.traits) }))
    .sort((a, b) => b.score - a.score);

  let chosenIndex = 0;
  if (scored[1] && Math.abs(scored[0].score - scored[1].score) < 0.01) {
    chosenIndex = Math.random() < 0.5 ? 0 : 1;
  }

  const chosen = scored[chosenIndex];
  const others = scored.filter((_, i) => i !== chosenIndex).slice(0, 2);

  return {
    character: chosen.character,
    matchPercent: toPercent(chosen.score),
    runnerUps: others.map((s) => ({ character: s.character, matchPercent: toPercent(s.score) })),
  };
}
