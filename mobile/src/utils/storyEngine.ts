import { MOOD_REVEAL_COPY, getChoiceById } from '../constants/storyBeats';

const MOOD_OPTIONS = [
  { value: 'happy', label: 'Happy', emoji: '😊' },
  { value: 'tired', label: 'Tired', emoji: '😴' },
  { value: 'stressed', label: 'Stressed', emoji: '😰' },
  { value: 'celebrating', label: 'Celebrating', emoji: '🥳' },
  { value: 'relaxed', label: 'Relaxed', emoji: '😌' },
  { value: 'adventurous', label: 'Adventurous', emoji: '🤩' },
];

const MOOD_DIMENSIONS: Record<string, { energy: number; valence: number; social: number }> = {
  happy: { energy: 0.85, valence: 0.9, social: 0.6 },
  tired: { energy: 0.2, valence: 0.45, social: 0.25 },
  stressed: { energy: 0.55, valence: 0.2, social: 0.3 },
  celebrating: { energy: 0.95, valence: 0.95, social: 0.95 },
  relaxed: { energy: 0.25, valence: 0.75, social: 0.35 },
  adventurous: { energy: 0.9, valence: 0.85, social: 0.7 },
};

const DIMENSION_KEYS = ['energy', 'valence', 'social'] as const;
const BASE_NEUTRAL = { energy: 0.5, valence: 0.5, social: 0.5 };

function clamp01(n: number) { return Math.min(1, Math.max(0, n)); }

function distance(
  a: { energy: number; valence: number; social: number },
  b: { energy: number; valence: number; social: number },
) {
  return Math.sqrt(DIMENSION_KEYS.reduce((sum, key) => sum + (a[key] - b[key]) ** 2, 0));
}

export interface StoryMoodResult {
  moodSlug: string;
  moodLabel: string;
  moodEmoji: string;
  storySummary: string;
  vector: { energy: number; valence: number; social: number };
}

export function computeMoodFromStory(choiceIds: string[]): StoryMoodResult {
  const vector = { ...BASE_NEUTRAL };

  choiceIds.forEach((choiceId) => {
    const found = getChoiceById(choiceId);
    if (!found) return;
    const weight = found.beat.weight ?? 1;
    DIMENSION_KEYS.forEach((key) => { vector[key] += (found.choice.deltas[key] ?? 0) * weight; });
  });

  DIMENSION_KEYS.forEach((key) => { vector[key] = clamp01(vector[key]); });

  let bestSlug = MOOD_OPTIONS[0].value;
  let bestDist = Infinity;
  for (const mood of MOOD_OPTIONS) {
    const d = distance(vector, MOOD_DIMENSIONS[mood.value]);
    if (d < bestDist) { bestDist = d; bestSlug = mood.value; }
  }

  const mood = MOOD_OPTIONS.find((m) => m.value === bestSlug);
  const summary = MOOD_REVEAL_COPY[bestSlug] || `Sounds like you're feeling ${mood?.label.toLowerCase() ?? bestSlug}.`;

  return { moodSlug: bestSlug, moodLabel: mood?.label ?? bestSlug, moodEmoji: mood?.emoji ?? '😊', storySummary: summary, vector };
}
