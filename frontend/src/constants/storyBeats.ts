export interface MoodDeltas {
  energy: number;
  valence: number;
  social: number;
}

export interface StoryChoice {
  id: string;
  label: string;
  emoji: string;
  deltas: MoodDeltas;
}

export interface StoryBeat {
  id: string;
  segmentLabel: string;
  scene: "morning" | "lunch" | "evening";
  weight: number;
  narrative: string;
  choices: StoryChoice[];
}

export const STORY_COLD_OPEN = {
  title: "Your day starts now",
  subtitle:
    "Make a few quick choices — we'll read your mood from how it unfolds.",
};

export const STORY_BEATS: StoryBeat[] = [
  {
    id: "morning",
    segmentLabel: "Morning",
    scene: "morning",
    weight: 1,
    narrative:
      "Your alarm goes off. The calendar says back-to-back meetings until lunch.",
    choices: [
      {
        id: "morning_coffee",
        label: "Grab coffee and power through",
        emoji: "☕",
        deltas: { energy: 0.12, valence: 0.05, social: 0.05 },
      },
      {
        id: "morning_snooze",
        label: "Snooze once — you need the sleep",
        emoji: "😴",
        deltas: { energy: -0.1, valence: 0.02, social: -0.05 },
      },
      {
        id: "morning_skip",
        label: "Skip breakfast, dive into inbox",
        emoji: "📧",
        deltas: { energy: 0.05, valence: -0.08, social: -0.08 },
      },
    ],
  },
  {
    id: "lunch",
    segmentLabel: "Lunch",
    scene: "lunch",
    weight: 1,
    narrative:
      "It's past noon. Your stomach reminds you the morning was intense.",
    choices: [
      {
        id: "lunch_team",
        label: "Team lunch — good energy at the table",
        emoji: "👥",
        deltas: { energy: 0.08, valence: 0.15, social: 0.2 },
      },
      {
        id: "lunch_desk",
        label: "Eat at desk between calls",
        emoji: "💻",
        deltas: { energy: -0.05, valence: -0.05, social: -0.1 },
      },
      {
        id: "lunch_skip",
        label: "Skip lunch — too much to finish",
        emoji: "⏭️",
        deltas: { energy: -0.12, valence: -0.12, social: -0.05 },
      },
    ],
  },
  {
    id: "evening",
    segmentLabel: "Evening",
    scene: "evening",
    weight: 1.5,
    narrative: "Evening rolls in. The day is behind you — what happens next?",
    choices: [
      {
        id: "evening_treat",
        label: "Treat yourself — you earned it",
        emoji: "🎁",
        deltas: { energy: 0.1, valence: 0.2, social: 0.1 },
      },
      {
        id: "evening_couch",
        label: "Couch, show, something easy",
        emoji: "🛋️",
        deltas: { energy: -0.15, valence: 0.1, social: -0.1 },
      },
      {
        id: "evening_still",
        label: "Still finishing work — dinner can wait",
        emoji: "💼",
        deltas: { energy: 0.05, valence: -0.15, social: -0.05 },
      },
    ],
  },
];

export const MOOD_REVEAL_COPY: Record<string, string> = {
  happy: "Bright day — you're riding good energy into dinner.",
  tired: "Long day — your body is asking for something easy and comforting.",
  stressed: "Full-on day — let's find food that takes the edge off.",
  celebrating: "You turned the day into a win — time to eat like it.",
  relaxed: "Steady, unhurried vibes — dinner should feel unforced.",
  adventurous: "Your day had twists — you're ready for something bold.",
};

export const STORY_FOLLOW_UP = {
  craving: {
    title: "After a day like that, what sounds good?",
    subtitle: "Pick the vibe your stomach is asking for.",
    options: [
      { value: "spicy", label: "Spicy", emoji: "🌶️" },
      { value: "sweet", label: "Sweet", emoji: "🍯" },
      { value: "comfort", label: "Comfort Food", emoji: "🍲" },
      { value: "healthy", label: "Healthy", emoji: "🥗" },
      { value: "light", label: "Light", emoji: "🌿" },
      { value: "indulgent", label: "Indulgent", emoji: "🍰" },
    ],
  },
  budget: {
    title: "What's realistic for tonight?",
    subtitle: "No judgment — we'll match spots to your spend.",
    options: [
      { value: "budget", label: "Budget", subtitle: "Under ₹300", emoji: "💰" },
      {
        value: "moderate",
        label: "Moderate",
        subtitle: "₹300 – ₹800",
        emoji: "💰💰",
      },
      {
        value: "splurge",
        label: "Splurge",
        subtitle: "Above ₹800",
        emoji: "💰💰💰",
      },
    ],
  },
  preference: {
    title: "Any dietary lines?",
    subtitle: "So we only suggest what works for you.",
    options: [
      { value: "veg", label: "Vegetarian", emoji: "🥬" },
      { value: "non-veg", label: "Non-Veg", emoji: "🍗" },
      { value: "both", label: "No Preference", emoji: "🍽️" },
    ],
  },
};

export function getChoiceById(choiceId: string) {
  for (const beat of STORY_BEATS) {
    const choice = beat.choices.find((c) => c.id === choiceId);
    if (choice) return { choice, beat };
  }
  return null;
}
