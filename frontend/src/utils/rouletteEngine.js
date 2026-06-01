import { MOOD_DIMENSIONS, MOOD_OPTIONS } from '../constants/moods';
import { blendFromDimensionVectors } from './blendEngine';

export const SLICE_COUNT = MOOD_OPTIONS.length;
export const SLICE_DEG = 360 / SLICE_COUNT;

/**
 * Wheel rotation R (deg, clockwise). Pointer fixed at top.
 * @returns {{ sliceIndex: number, t: number, primarySlug: string, neighborSlug: string }}
 */
export function angleToSpinResult(rotationDeg) {
  const effective = ((360 - (rotationDeg % 360)) + 360) % 360;
  const sliceIndex = Math.floor(effective / SLICE_DEG) % SLICE_COUNT;
  const t = (effective % SLICE_DEG) / SLICE_DEG;
  const primarySlug = MOOD_OPTIONS[sliceIndex].value;
  const neighborSlug = MOOD_OPTIONS[(sliceIndex + 1) % SLICE_COUNT].value;

  return { sliceIndex, t, primarySlug, neighborSlug };
}

function lerpDimensions(slugA, slugB, t) {
  const a = MOOD_DIMENSIONS[slugA];
  const b = MOOD_DIMENSIONS[slugB];
  if (!a || !b) return null;

  return {
    energy: a.energy + (b.energy - a.energy) * t,
    valence: a.valence + (b.valence - a.valence) * t,
    social: a.social + (b.social - a.social) * t,
  };
}

/**
 * @param {{ primarySlug: string, neighborSlug: string, t: number }} spin
 */
export function spinToDimensions(spin) {
  return lerpDimensions(spin.primarySlug, spin.neighborSlug, spin.t);
}

/**
 * @param {ReturnType<typeof angleToSpinResult>} spin1
 * @param {ReturnType<typeof angleToSpinResult>} spin2
 */
export function blendFromRouletteSpins(spin1, spin2) {
  const dims1 = spinToDimensions(spin1);
  const dims2 = spinToDimensions(spin2);
  if (!dims1 || !dims2) return null;

  const averaged = {
    energy: (dims1.energy + dims2.energy) / 2,
    valence: (dims1.valence + dims2.valence) / 2,
    social: (dims1.social + dims2.social) / 2,
  };

  return blendFromDimensionVectors(averaged, {
    inputMoods: [
      { value: spin1.primarySlug, neighbor: spin1.neighborSlug, t: spin1.t },
      { value: spin2.primarySlug, neighbor: spin2.neighborSlug, t: spin2.t },
    ],
  });
}

export function formatBetweenLabel(spin) {
  if (spin.t < 0.25 || spin.t > 0.75) return null;
  const primary = MOOD_OPTIONS.find((m) => m.value === spin.primarySlug);
  const neighbor = MOOD_OPTIONS.find((m) => m.value === spin.neighborSlug);
  if (!primary || !neighbor) return null;
  return `Between ${primary.label} and ${neighbor.label}`;
}

/** Random spin rotation: 4–6 full turns + random offset */
export function randomSpinRotation() {
  const extraTurns = 4 + Math.floor(Math.random() * 3);
  const offset = Math.random() * 360;
  return extraTurns * 360 + offset;
}
