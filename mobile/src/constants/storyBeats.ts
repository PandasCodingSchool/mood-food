export interface DayChoice {
  emoji: string;
  label: string;
}

export interface DayScene {
  time: string;
  location: string;
  emoji: string;
  colors: readonly [string, string, ...string[]];
  locations?: readonly [number, number, ...number[]];
  narrative: string;
  subtext: string;
  choices: DayChoice[];
}

export interface DayMoodTag {
  emoji: string;
  label: string;
}

export interface DayMood {
  emoji: string;
  label: string;
  desc: string;
  tags: DayMoodTag[];
  mood: string;
  craving: string;
  budget: string;
  preference: string;
}

/** Matches the design's exact 5 scenes, one per moment of the day. */
export const DAY_SCENES: DayScene[] = [
  {
    time: '7:15 AM',
    location: 'Bedroom',
    emoji: '⏰',
    colors: ['#1e3a5f', '#f59e0b'],
    narrative: "Your alarm goes off. The sun's barely up.",
    subtext: 'How do you start this day?',
    choices: [
      { emoji: '😴', label: 'Snooze 3 more times... okay maybe 4' },
      { emoji: '🏃', label: 'Up and at it — morning run!' },
      { emoji: '📱', label: 'Scroll phone for 20 min first' },
    ],
  },
  {
    time: '8:30 AM',
    location: 'Kitchen',
    emoji: '☕',
    colors: ['#92400e', '#fbbf24'],
    narrative: "You stumble to the kitchen. What's breakfast?",
    subtext: "Choose wisely... or don't.",
    choices: [
      { emoji: '🥣', label: 'Proper breakfast — eggs, toast, the works' },
      { emoji: '☕', label: 'Just coffee. Coffee IS breakfast.' },
      { emoji: '🍩', label: "Leftover pizza? Don't judge me." },
    ],
  },
  {
    time: '12:30 PM',
    location: 'Work / Desk',
    emoji: '💻',
    colors: ['#1e40af', '#60a5fa'],
    narrative: "It's lunchtime. Your coworker wants to try a new place.",
    subtext: "But you're in the middle of something...",
    choices: [
      { emoji: '🤝', label: "Let's go! I need a break anyway" },
      { emoji: '🥡', label: "Order delivery — I'm in the zone" },
      { emoji: '😅', label: 'I forgot to eat... is it 12:30 already?' },
    ],
  },
  {
    time: '3:45 PM',
    location: 'Break Room',
    emoji: '🥱',
    colors: ['#6d28d9', '#a78bfa'],
    narrative: 'The afternoon slump hits HARD. You need fuel.',
    subtext: 'Your energy is fading fast.',
    choices: [
      { emoji: '🍫', label: 'Vending machine raid — chocolate saves' },
      { emoji: '🍵', label: 'Green tea & a handful of nuts' },
      { emoji: '💪', label: 'Walk it off, no snack needed' },
    ],
  },
  {
    time: '6:30 PM',
    location: 'Home',
    emoji: '🌆',
    colors: ['#7c2d12', '#f97316', '#fbbf24'],
    locations: [0, 0.6, 1],
    narrative: "You're finally home. The day is done.",
    subtext: 'How are you feeling right now?',
    choices: [
      { emoji: '🛋️', label: 'Exhausted — comfort food and chill' },
      { emoji: '🎉', label: "Wired — let's go OUT tonight" },
      { emoji: '😌', label: 'Peaceful — something light and easy' },
    ],
  },
];

/** Index order matters — matched by the scorer in storyEngine.ts (0=comfort,1=social,2=balanced,3=chaotic). */
export const DAY_MOODS: DayMood[] = [
  {
    emoji: '😌',
    label: 'Cozy & Drained',
    desc: 'You had a long one. Your body wants warmth, comfort, and zero decision-making. Let us handle dinner.',
    tags: [
      { emoji: '🔋', label: 'Low energy' },
      { emoji: '🧸', label: 'Comfort zone' },
      { emoji: '🍲', label: 'Warm foods' },
    ],
    mood: 'tired',
    craving: 'comfort',
    budget: 'medium',
    preference: 'both',
  },
  {
    emoji: '⚡',
    label: 'Hyped & Social',
    desc: "You're buzzing! Today gave you energy and you want to keep the momentum going with bold, fun food.",
    tags: [
      { emoji: '🔥', label: 'High energy' },
      { emoji: '🎯', label: 'Adventurous' },
      { emoji: '🌮', label: 'Bold flavors' },
    ],
    mood: 'celebrating',
    craving: 'spicy',
    budget: 'medium',
    preference: 'both',
  },
  {
    emoji: '🧘',
    label: 'Balanced & Mindful',
    desc: 'You navigated the day with intention. You want something nourishing that matches your centered state.',
    tags: [
      { emoji: '✨', label: 'Centered' },
      { emoji: '🥗', label: 'Clean eats' },
      { emoji: '💚', label: 'Feel-good' },
    ],
    mood: 'relaxed',
    craving: 'healthy',
    budget: 'medium',
    preference: 'both',
  },
  {
    emoji: '🤪',
    label: 'Chaotic & Hungry',
    desc: "What a wild ride. You forgot to eat, made impulsive choices, and now you're STARVING. Feed the chaos.",
    tags: [
      { emoji: '🌪️', label: 'Chaotic' },
      { emoji: '😈', label: 'No rules' },
      { emoji: '🍔', label: 'MAX portions' },
    ],
    mood: 'adventurous',
    craving: 'comfort',
    budget: 'medium',
    preference: 'both',
  },
];
