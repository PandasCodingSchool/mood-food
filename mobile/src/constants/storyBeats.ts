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
export type TimeSlot = "morning" | "afternoon" | "evening" | "night";
export type BeatId = "morning" | "lunch" | "evening" | "night";

export interface StoryBeat {
  id: BeatId;
  segmentLabel: string;
  weight: number;
  narratives: Record<"past" | "present" | "future", string>;
  choices: StoryChoice[];
}

export interface ActiveStoryBeat {
  id: BeatId;
  segmentLabel: string;
  weight: number;
  narrative: string;
  choices: StoryChoice[];
}

export interface ActiveStory {
  timeSlot: TimeSlot;
  coldOpen: { title: string; subtitle: string };
  beats: ActiveStoryBeat[];
  segments: string[];
  followUp: typeof STORY_FOLLOW_UP;
}

const STORY_BEATS_CATALOG: StoryBeat[] = [
  {
    id: "morning",
    segmentLabel: "Morning",
    weight: 1,
    narratives: {
      present:
        "Your alarm just went off. The calendar says back-to-back meetings till lunch.",
      past: "This morning had back-to-back meetings the moment you opened your laptop.",
      future:
        "Tomorrow morning will hit fast. Meetings stack up before you've even had coffee.",
    },
    choices: [
      {
        id: "morning_coffee",
        label: "Grab coffee and power through",
        emoji: "☕",
        deltas: { energy: 0.12, valence: 0.05, social: 0.05 },
      },
      {
        id: "morning_snooze",
        label: "Snooze once. You need the sleep.",
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
    weight: 1,
    narratives: {
      present:
        "It's around lunch. Your stomach reminds you the morning was intense.",
      past: "By lunchtime, the morning had already taken its toll.",
      future: "Lunch is coming up. How do you usually handle it?",
    },
    choices: [
      {
        id: "lunch_team",
        label: "Team lunch with good energy at the table",
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
        label: "Skip lunch, too much to finish",
        emoji: "⏭️",
        deltas: { energy: -0.12, valence: -0.12, social: -0.05 },
      },
    ],
  },
  {
    id: "evening",
    segmentLabel: "Evening",
    weight: 1.5,
    narratives: {
      present: "Evening is rolling in. The day is mostly behind you.",
      past: "By evening, the day had really stacked up.",
      future: "Tonight is still ahead. Picture how you'd want it to go.",
    },
    choices: [
      {
        id: "evening_treat",
        label: "Treat yourself. You earned it.",
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
        label: "Still finishing work, dinner can wait",
        emoji: "💼",
        deltas: { energy: 0.05, valence: -0.15, social: -0.05 },
      },
    ],
  },
  {
    id: "night",
    segmentLabel: "Late Night",
    weight: 1.2,
    narratives: {
      present: "It's late. The world's quiet and you're still up.",
      past: "Last night ran long. You were up later than planned.",
      future: "Late tonight, after everything winds down...",
    },
    choices: [
      {
        id: "night_chill",
        label: "Chill mode, screen and snacks",
        emoji: "📺",
        deltas: { energy: -0.1, valence: 0.15, social: -0.05 },
      },
      {
        id: "night_crave",
        label: "Late-night craving hitting hard",
        emoji: "🌙",
        deltas: { energy: 0.05, valence: 0.1, social: -0.02 },
      },
      {
        id: "night_wired",
        label: "Wired, can't sleep yet",
        emoji: "👀",
        deltas: { energy: 0.15, valence: -0.05, social: -0.05 },
      },
    ],
  },
];

const SEQUENCES: Record<
  TimeSlot,
  Array<{ id: BeatId; perspective: "past" | "present" | "future" }>
> = {
  morning: [
    { id: "morning", perspective: "present" },
    { id: "lunch", perspective: "future" },
    { id: "evening", perspective: "future" },
  ],
  afternoon: [
    { id: "morning", perspective: "past" },
    { id: "lunch", perspective: "present" },
    { id: "evening", perspective: "future" },
  ],
  evening: [
    { id: "morning", perspective: "past" },
    { id: "lunch", perspective: "past" },
    { id: "evening", perspective: "present" },
  ],
  night: [
    { id: "lunch", perspective: "past" },
    { id: "evening", perspective: "past" },
    { id: "night", perspective: "present" },
  ],
};

const COLD_OPENS: Record<TimeSlot, { title: string; subtitle: string }> = {
  morning: {
    title: "Good morning. Let's set the scene.",
    subtitle:
      "Walk us through how today's likely to unfold. We'll pick food that fits.",
  },
  afternoon: {
    title: "Hey, mid-day check-in",
    subtitle:
      "Tell us how your day's gone so far. We'll suggest something that fits the rest of it.",
  },
  evening: {
    title: "Long day? Let's wrap it right.",
    subtitle:
      "Walk us through your day. We'll find food that matches the mood.",
  },
  night: {
    title: "Still up? Same.",
    subtitle: "Tell us how the day landed. We'll find something for right now.",
  },
};

export const MOOD_REVEAL_COPY: Record<string, string> = {
  happy: "Bright day. You're riding good energy into your next meal.",
  tired: "Long day. Your body is asking for something easy and comforting.",
  stressed: "Full-on day. Let's find food that takes the edge off.",
  celebrating: "You turned the day into a win. Time to eat like it.",
  relaxed: "Steady, unhurried vibes. Food should feel unforced.",
  adventurous: "Your day had twists. You're ready for something bold.",
};

export const STORY_FOLLOW_UP = {
  craving: {
    title: "What sounds good right now?",
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
    title: "What's realistic right now?",
    subtitle: "No judgment. We'll match spots to your spend.",
    options: [
      { value: "low", label: "Budget", subtitle: "Under ₹200", emoji: "💰" },
      {
        value: "medium",
        label: "Moderate",
        subtitle: "₹200 – ₹500",
        emoji: "💰💰",
      },
      {
        value: "high",
        label: "Splurge",
        subtitle: "Above ₹500",
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

export function getCurrentTimeSlot(now: Date = new Date()): TimeSlot {
  const h = now.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

export function getActiveStory(now: Date = new Date()): ActiveStory {
  const timeSlot = getCurrentTimeSlot(now);
  const sequence = SEQUENCES[timeSlot];
  const beats: ActiveStoryBeat[] = sequence.map((step) => {
    const beat = STORY_BEATS_CATALOG.find((b) => b.id === step.id)!;
    return {
      id: beat.id,
      segmentLabel: beat.segmentLabel,
      weight: beat.weight,
      narrative: beat.narratives[step.perspective],
      choices: beat.choices,
    };
  });
  return {
    timeSlot,
    coldOpen: COLD_OPENS[timeSlot],
    beats,
    segments: beats.map((b) => b.segmentLabel),
    followUp: STORY_FOLLOW_UP,
  };
}

export function getChoiceById(choiceId: string) {
  for (const beat of STORY_BEATS_CATALOG) {
    const choice = beat.choices.find((c) => c.id === choiceId);
    if (choice) return { choice, beat };
  }
  return null;
}

export function getMoodCravingFollowUp(mood: string) {
  const copies: Record<string, { title: string; subtitle: string }> = {
    stressed: {
      title: "What kind of fix sounds right?",
      subtitle: "Food helps. Let's find the right one.",
    },
    happy: {
      title: "What amplifies the good mood?",
      subtitle: "You're on a roll — keep it going.",
    },
    tired: {
      title: "What would actually help right now?",
      subtitle: "Low energy. No pressure — pick honestly.",
    },
    celebrating: {
      title: "What matches the moment?",
      subtitle: "Tonight deserves something special.",
    },
    relaxed: {
      title: "What fits the chill?",
      subtitle: "No rush. What sounds just right?",
    },
    adventurous: {
      title: "How bold are we going?",
      subtitle: "You're up for anything — what calls you?",
    },
  };
  const copy = copies[mood] ?? copies.relaxed;
  return { ...copy, options: STORY_FOLLOW_UP.craving.options };
}
