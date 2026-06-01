/** @typedef {{ energy: number, valence: number, social: number }} MoodDeltas */

/**
 * @typedef {Object} StoryChoice
 * @property {string} id
 * @property {string} label
 * @property {string} emoji
 * @property {MoodDeltas} deltas
 */

/**
 * @typedef {Object} StoryBeat
 * @property {string} id
 * @property {string} segmentLabel
 * @property {'morning' | 'lunch' | 'evening'} scene
 * @property {string} narrative
 * @property {StoryChoice[]} choices
 * @property {number} [weight]
 */

export const STORY_COLD_OPEN = {
  title: 'Your day starts now',
  subtitle: "Make a few quick choices — we'll read your mood from how it unfolds.",
};

/** @type {StoryBeat[]} */
export const STORY_BEATS = [
  {
    id: 'morning',
    segmentLabel: 'Morning',
    scene: 'morning',
    weight: 1,
    narrative: 'Your alarm goes off. The calendar says back-to-back meetings until lunch.',
    choices: [
      {
        id: 'morning_coffee',
        label: 'Grab coffee and power through',
        emoji: '☕',
        deltas: { energy: 0.12, valence: 0.05, social: 0.05 },
      },
      {
        id: 'morning_snooze',
        label: 'Snooze once — you need the sleep',
        emoji: '😴',
        deltas: { energy: -0.1, valence: 0.02, social: -0.05 },
      },
      {
        id: 'morning_skip',
        label: 'Skip breakfast, dive into inbox',
        emoji: '📧',
        deltas: { energy: 0.05, valence: -0.08, social: -0.08 },
      },
    ],
  },
  {
    id: 'lunch',
    segmentLabel: 'Lunch',
    scene: 'lunch',
    weight: 1,
    narrative: "It's past noon. Your stomach reminds you the morning was intense.",
    choices: [
      {
        id: 'lunch_team',
        label: 'Team lunch — good energy at the table',
        emoji: '🍽️',
        deltas: { energy: 0.08, valence: 0.15, social: 0.2 },
      },
      {
        id: 'lunch_desk',
        label: 'Eat at desk between calls',
        emoji: '💻',
        deltas: { energy: -0.05, valence: -0.05, social: -0.1 },
      },
      {
        id: 'lunch_skip',
        label: 'Skip lunch — too much to finish',
        emoji: '⏭️',
        deltas: { energy: -0.12, valence: -0.12, social: -0.05 },
      },
    ],
  },
  {
    id: 'evening',
    segmentLabel: 'Evening',
    scene: 'evening',
    weight: 1.5,
    narrative: 'Evening rolls in. The day is behind you — what happens next?',
    choices: [
      {
        id: 'evening_treat',
        label: 'Treat yourself — you earned it',
        emoji: '🎉',
        deltas: { energy: 0.1, valence: 0.2, social: 0.1 },
      },
      {
        id: 'evening_couch',
        label: 'Couch, show, something easy',
        emoji: '🛋️',
        deltas: { energy: -0.15, valence: 0.1, social: -0.1 },
      },
      {
        id: 'evening_still',
        label: 'Still finishing work — dinner can wait',
        emoji: '😰',
        deltas: { energy: 0.05, valence: -0.15, social: -0.05 },
      },
    ],
  },
];

export const MOOD_REVEAL_COPY = {
  happy: "Bright day — you're riding good energy into dinner.",
  tired: 'Long day — your body is asking for something easy and comforting.',
  stressed: "Full-on day — let's find food that takes the edge off.",
  celebrating: 'You turned the day into a win — time to eat like it.',
  relaxed: 'Steady, unhurried vibes — dinner should feel unforced.',
  adventurous: "Your day had twists — you're ready for something bold.",
};

export function getChoiceById(choiceId) {
  for (const beat of STORY_BEATS) {
    const choice = beat.choices.find((c) => c.id === choiceId);
    if (choice) return { choice, beat };
  }
  return null;
}
