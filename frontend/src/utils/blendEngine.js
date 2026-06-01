import {
  MOOD_DIMENSIONS,
  MOOD_OPTIONS,
  getMoodByValue,
} from '../constants/moods';

const DIMENSION_KEYS = ['energy', 'valence', 'social'];

function averageDimensions(moodA, moodB) {
  const dimsA = MOOD_DIMENSIONS[moodA];
  const dimsB = MOOD_DIMENSIONS[moodB];
  if (!dimsA || !dimsB) return null;

  return DIMENSION_KEYS.reduce((acc, key) => {
    acc[key] = (dimsA[key] + dimsB[key]) / 2;
    return acc;
  }, {});
}

function distance(a, b) {
  return Math.sqrt(
    DIMENSION_KEYS.reduce((sum, key) => sum + (a[key] - b[key]) ** 2, 0),
  );
}

export function resolveNearestMood(averaged) {
  let bestSlug = MOOD_OPTIONS[0].value;
  let bestDist = Infinity;

  for (const mood of MOOD_OPTIONS) {
    const d = distance(averaged, MOOD_DIMENSIONS[mood.value]);
    if (d < bestDist) {
      bestDist = d;
      bestSlug = mood.value;
    }
  }

  return bestSlug;
}

function energyLevel(energy) {
  if (energy >= 0.7) return 'high';
  if (energy >= 0.4) return 'mid';
  return 'low';
}

function valenceLevel(valence) {
  if (valence >= 0.7) return 'positive';
  if (valence >= 0.45) return 'neutral';
  return 'negative';
}

const BLEND_NAMES = {
  'high-positive': 'Radiant Rush',
  'high-neutral': 'Wired & Ready',
  'high-negative': 'Chaos Mode',
  'mid-positive': 'Balanced Glow',
  'mid-neutral': 'Steady Vibes',
  'mid-negative': 'Pressure Cooker',
  'low-positive': 'Cozy Calm',
  'low-neutral': 'Soft Reset',
  'low-negative': 'Meltdown Mode',
};

const BLEND_TAGLINES = {
  'high-positive': 'Your moods just threw a party in the blender.',
  'high-neutral': 'High energy meets chill — expect the unexpected.',
  'high-negative': 'Intense mix ahead. Comfort food might help.',
  'mid-positive': 'A pleasant middle ground with a sunny edge.',
  'mid-neutral': 'Neither here nor there — perfectly in between.',
  'mid-negative': 'A little tense, a little tired. Treat yourself gently.',
  'low-positive': 'Slow down and savor something warm.',
  'low-neutral': 'Quiet vibes. Something simple sounds perfect.',
  'low-negative': 'Take a breath. Something soothing is calling.',
};

export function getBlendNameAndTagline(averaged) {
  const key = `${energyLevel(averaged.energy)}-${valenceLevel(averaged.valence)}`;
  return {
    blendName: BLEND_NAMES[key] || 'Mood Fusion',
    tagline: BLEND_TAGLINES[key] || 'A unique blend made just for you.',
  };
}

/**
 * Build blend display from an averaged dimension vector.
 * @param {{ energy: number, valence: number, social: number }} averaged
 * @param {{ inputMoods?: Array<{ value: string, label?: string, icon?: string }> }} [meta]
 */
export function blendFromDimensionVectors(averaged, meta = {}) {
  if (!averaged) return null;

  const resultMoodSlug = resolveNearestMood(averaged);
  const { blendName, tagline } = getBlendNameAndTagline(averaged);
  const resultMood = getMoodByValue(resultMoodSlug);

  const inputMoods = (meta.inputMoods || []).map((m) => {
    const full = getMoodByValue(m.value);
    return {
      value: m.value,
      label: m.label ?? full?.label ?? m.value,
      icon: m.icon ?? full?.icon ?? m.value,
    };
  });

  return {
    inputMoods,
    resultMoodSlug,
    resultIcon: resultMood?.icon ?? resultMoodSlug,
    blendName,
    tagline,
  };
}

/**
 * Blend two mood slugs into a display result + canonical mood for recommendations.
 * @param {string} moodA
 * @param {string} moodB
 */
export function blendMoods(moodA, moodB) {
  const averaged = averageDimensions(moodA, moodB);
  if (!averaged) {
    return null;
  }

  const inputMoods = [moodA, moodB].map((slug) => getMoodByValue(slug)).filter(Boolean);

  return blendFromDimensionVectors(averaged, {
    inputMoods: inputMoods.map((m) => ({
      value: m.value,
      label: m.label,
      icon: m.icon,
    })),
  });
}
