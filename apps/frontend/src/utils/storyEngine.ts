import { MOOD_REVEAL_COPY, getChoiceById } from "../constants/storyBeats";

const MOOD_OPTIONS = [
  { value: "happy", label: "Happy", emoji: "😊" },
  { value: "tired", label: "Tired", emoji: "😴" },
  { value: "stressed", label: "Stressed", emoji: "😰" },
  { value: "celebrating", label: "Celebrating", emoji: "🥳" },
  { value: "relaxed", label: "Relaxed", emoji: "😌" },
  { value: "adventurous", label: "Adventurous", emoji: "🤩" },
];

const MOOD_DIMENSIONS: Record<
  string,
  { energy: number; valence: number; social: number }
> = {
  happy: { energy: 0.85, valence: 0.9, social: 0.6 },
  tired: { energy: 0.2, valence: 0.45, social: 0.25 },
  stressed: { energy: 0.55, valence: 0.2, social: 0.3 },
  celebrating: { energy: 0.95, valence: 0.95, social: 0.95 },
  relaxed: { energy: 0.25, valence: 0.75, social: 0.35 },
  adventurous: { energy: 0.9, valence: 0.85, social: 0.7 },
};

const DIMENSION_KEYS = ["energy", "valence", "social"] as const;
const BASE_NEUTRAL = { energy: 0.5, valence: 0.5, social: 0.5 };

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function distance(
  a: { energy: number; valence: number; social: number },
  b: { energy: number; valence: number; social: number },
) {
  return Math.sqrt(
    DIMENSION_KEYS.reduce((sum, key) => sum + (a[key] - b[key]) ** 2, 0),
  );
}

function resolveNearestMood(vector: {
  energy: number;
  valence: number;
  social: number;
}) {
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

export interface StoryMoodResult {
  moodSlug: string;
  moodLabel: string;
  moodEmoji: string;
  storySummary: string;
  vector: { energy: number; valence: number; social: number };
}

// Running mood vector for a partial set of choices (same math as the final
// reveal, exposed so the next beat can adapt to the trajectory so far).
export function runningVector(choiceIds: string[]): {
  energy: number;
  valence: number;
  social: number;
} {
  const vector = { ...BASE_NEUTRAL };
  choiceIds.forEach((choiceId) => {
    const found = getChoiceById(choiceId);
    if (!found) return;
    const weight = found.beat.weight ?? 1;
    DIMENSION_KEYS.forEach((key) => {
      vector[key] += (found.choice.deltas[key] ?? 0) * weight;
    });
  });
  DIMENSION_KEYS.forEach((key) => {
    vector[key] = clamp01(vector[key]);
  });
  return vector;
}

// Orders a beat's choices so the one that continues the user's current mood
// trajectory appears first (dot product of choice deltas with the running
// vector's offset from neutral). Stable for ties.
export function orderChoicesByVector<
  T extends { deltas: { energy: number; valence: number; social: number } },
>(choices: T[], priorChoiceIds: string[]): T[] {
  if (priorChoiceIds.length === 0) return choices;
  const vector = runningVector(priorChoiceIds);
  const trend = {
    energy: vector.energy - BASE_NEUTRAL.energy,
    valence: vector.valence - BASE_NEUTRAL.valence,
    social: vector.social - BASE_NEUTRAL.social,
  };
  return choices
    .map((choice, i) => ({
      choice,
      i,
      score: DIMENSION_KEYS.reduce(
        (sum, key) => sum + choice.deltas[key] * trend[key],
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((s) => s.choice);
}

export function computeMoodFromStory(choiceIds: string[]): StoryMoodResult {
  const vector = { ...BASE_NEUTRAL };

  choiceIds.forEach((choiceId) => {
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
  const mood = MOOD_OPTIONS.find((m) => m.value === moodSlug);
  const summary =
    MOOD_REVEAL_COPY[moodSlug] ||
    `Sounds like you're feeling ${mood?.label.toLowerCase() ?? moodSlug}.`;

  return {
    moodSlug,
    moodLabel: mood?.label ?? moodSlug,
    moodEmoji: mood?.emoji ?? "😊",
    storySummary: summary,
    vector,
  };
}
