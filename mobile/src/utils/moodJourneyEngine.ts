// Mirrors frontend/src/utils/moodJourneyEngine.ts — keep the two in sync.
import {
  AXIS_KEYS,
  CLUSTERS,
  type AxisVector,
  type JourneyOption,
  type MoodCluster,
  zeroAxisVector,
} from '../constants/moodJourney';

export function accumulateAxes(selections: JourneyOption[]): AxisVector {
  const vec = zeroAxisVector();
  for (const opt of selections) {
    for (const key of AXIS_KEYS) {
      const w = opt.axisWeights[key];
      if (typeof w === 'number') vec[key] += w;
    }
  }
  return vec;
}

const MAX_RAW_MAGNITUDE = 6;

export function normalizeAxes(raw: AxisVector): AxisVector {
  const out = zeroAxisVector();
  for (const key of AXIS_KEYS) {
    out[key] = Math.max(-1, Math.min(1, raw[key] / MAX_RAW_MAGNITUDE));
  }
  return out;
}

function dot(vector: AxisVector, signature: Partial<AxisVector>): number {
  let sum = 0;
  for (const key of AXIS_KEYS) {
    const s = signature[key];
    if (typeof s === 'number') sum += s * vector[key];
  }
  return sum;
}

export interface ClusterMatchResult {
  cluster: MoodCluster;
  secondaryCluster: MoodCluster | null;
  score: number;
  axes: AxisVector;
}

const TIE_EPS = 1e-6;

export function matchCluster(raw: AxisVector, twistHint?: string): ClusterMatchResult {
  const scored = CLUSTERS.map((cluster) => ({
    cluster,
    score: dot(raw, cluster.signature),
  })).sort((a, b) => b.score - a.score);

  const top = scored[0];
  let tied = scored.filter((s) => Math.abs(s.score - top.score) < TIE_EPS);

  if (tied.length > 1) {
    const dominantAxis = AXIS_KEYS.reduce((best, key) =>
      Math.abs(raw[key]) > Math.abs(raw[best]) ? key : best,
    );
    const axisSign = Math.sign(raw[dominantAxis]);
    if (axisSign !== 0) {
      const axisMatched = tied.filter(
        (s) => Math.sign(s.cluster.signature[dominantAxis] ?? 0) === axisSign,
      );
      if (axisMatched.length >= 1) tied = axisMatched;
    }
  }

  if (tied.length > 1 && twistHint) {
    const hinted = tied.filter((s) => s.cluster.id === twistHint);
    if (hinted.length >= 1) tied = hinted;
  }

  const chosen = tied[0];
  const secondary = scored.find((s) => s.cluster.id !== chosen.cluster.id) ?? null;

  return {
    cluster: chosen.cluster,
    secondaryCluster: secondary?.cluster ?? null,
    score: chosen.score,
    axes: raw,
  };
}
