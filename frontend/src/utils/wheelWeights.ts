// Deterministic explore/exploit foundation for the Meal Roulette wheel.
// Rejecting a segment zeroes it and halves related segments; accepting boosts
// related segments. A future multi-armed-bandit policy can replace this.

export type Weights = Record<string, number>;

// Bidirectional relations between wheel segments.
const RELATED: Record<string, string[]> = {
  spicy: ["exotic", "fusion"],
  exotic: ["spicy", "fusion"],
  fusion: ["exotic", "spicy"],
  sweet: ["dessert"],
  dessert: ["sweet"],
  healthy: ["light"],
  light: ["healthy"],
  comfort: ["quick"],
  quick: ["comfort"],
  indulgent: ["seafood"],
  seafood: ["indulgent"],
};

export function initWeights(segmentIds: string[]): Weights {
  return Object.fromEntries(segmentIds.map((id) => [id, 1]));
}

export function applyReject(weights: Weights, segmentId: string): Weights {
  const next = { ...weights, [segmentId]: 0 };
  for (const related of RELATED[segmentId] ?? []) {
    if (next[related] > 0) next[related] = next[related] * 0.5;
  }
  return next;
}

export function applyAccept(weights: Weights, segmentId: string): Weights {
  const next = { ...weights };
  for (const related of RELATED[segmentId] ?? []) {
    if (next[related] > 0) next[related] = next[related] * 1.5;
  }
  return next;
}

// Weighted random pick over segments with weight > 0. Falls back to uniform
// over all ids if everything got zeroed (reject-happy user).
export function weightedPick(
  weights: Weights,
  segmentIds: string[],
  rand: () => number = Math.random,
): string {
  const alive = segmentIds.filter((id) => (weights[id] ?? 1) > 0);
  const pool = alive.length > 0 ? alive : segmentIds;
  const total = pool.reduce((sum, id) => sum + (weights[id] || 1), 0);
  let roll = rand() * total;
  for (const id of pool) {
    roll -= weights[id] || 1;
    if (roll <= 0) return id;
  }
  return pool[pool.length - 1];
}

// Suggested budget tier from accepted segment ids.
export function suggestBudgetTier(
  acceptedIds: string[],
): "budget" | "moderate" | "splurge" {
  const splurgey = new Set(["indulgent", "seafood", "exotic"]);
  const budgety = new Set(["quick", "light", "breakfast"]);
  let splurge = 0;
  let budget = 0;
  for (const id of acceptedIds) {
    if (splurgey.has(id)) splurge += 1;
    if (budgety.has(id)) budget += 1;
  }
  if (splurge > budget && splurge > 0) return "splurge";
  if (budget > splurge && budget > 0) return "budget";
  return "moderate";
}
