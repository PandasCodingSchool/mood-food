import { MOOD_DIMENSIONS, MOOD_OPTIONS, getMoodByValue } from '../constants/moods';
import { MOOD_REVEAL_COPY, STORY_BEATS, getChoiceById } from '../constants/storyBeats';

const DIMENSION_KEYS = ['energy', 'valence', 'social'];
const BASE_NEUTRAL = { energy: 0.5, valence: 0.5, social: 0.5 };

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function distance(a, b) {
  return Math.sqrt(
    DIMENSION_KEYS.reduce((sum, key) => sum + (a[key] - b[key]) ** 2, 0),
  );
}

function resolveNearestMood(vector) {
  let bestSlug = MOOD_OPTIONS[0].value;
  let bestDist = Infinity;

  for (const mood of MOOD_OPTIONS) {
    const d = distance(vector, MOOD_DIMENSIONS[mood.value]);
    if (d < bestDist) {
      bestDist = d;
      bestSlug = mood.value;
    }
  }

  return bestSlug;
}

/**
 * @param {string[]} choiceIds — one per beat, in order
 */
export function computeMoodFromStory(choiceIds) {
  const vector = { ...BASE_NEUTRAL };

  choiceIds.forEach((choiceId, beatIndex) => {
    const found = getChoiceById(choiceId);
    if (!found) return;

    const weight = found.beat.weight ?? 1;
    const { deltas } = found.choice;

    DIMENSION_KEYS.forEach((key) => {
      vector[key] += (deltas[key] ?? 0) * weight;
    });
  });

  DIMENSION_KEYS.forEach((key) => {
    vector[key] = clamp01(vector[key]);
  });

  const moodSlug = resolveNearestMood(vector);
  const mood = getMoodByValue(moodSlug);
  const summary =
    MOOD_REVEAL_COPY[moodSlug] ||
    `Sounds like you're feeling ${mood?.label?.toLowerCase() ?? moodSlug}.`;

  return {
    moodSlug,
    moodLabel: mood?.label ?? moodSlug,
    moodIcon: mood?.icon ?? 'happy',
    storySummary: summary,
    vector,
  };
}

export function getBeatIndex(beatId) {
  return STORY_BEATS.findIndex((b) => b.id === beatId);
}

export { STORY_BEATS };
