export interface CharacterOption {
  emoji: string;
  label: string;
  sub: string;
  iconBg: string;
}

export interface CharacterQuestion {
  emoji: string;
  question: string;
  options: CharacterOption[];
}

export interface CharacterProfile {
  name: string;
  show: string;
  emoji: string;
  bg: readonly [string, string];
  mealEmoji: string;
  mealName: string;
  mealDesc: string;
  quote: string;
  mood: string;
  craving: string;
  budget: string;
  preference: string;
}

/** Matches the design's exact 4 questions — each option's index (0-3) feeds the scorer below. */
export const CHAR_QUESTIONS: CharacterQuestion[] = [
  {
    emoji: '🌙',
    question: "It's Friday night. What's the move?",
    options: [
      { emoji: '🛋️', label: 'Couch & snacks', sub: 'Netflix marathon, no pants', iconBg: 'rgba(249,115,22,0.2)' },
      { emoji: '🎉', label: 'Out with the squad', sub: 'Dancing, vibes, chaos', iconBg: 'rgba(236,72,153,0.2)' },
      { emoji: '🧪', label: 'Trying something new', sub: "That weird pop-up? I'm in", iconBg: 'rgba(59,130,246,0.2)' },
      { emoji: '📚', label: 'Quiet night in', sub: 'Candles, tea, deep thoughts', iconBg: 'rgba(16,185,129,0.2)' },
    ],
  },
  {
    emoji: '😱',
    question: 'Your friend double-books you. Your reaction?',
    options: [
      { emoji: '😂', label: '"Classic. I\'ll just eat both dinners"', sub: 'Roll with it', iconBg: 'rgba(249,115,22,0.2)' },
      { emoji: '😤', label: '"I will remember this betrayal"', sub: 'Dramatic but fair', iconBg: 'rgba(239,68,68,0.2)' },
      { emoji: '🤷', label: '"More solo time for me"', sub: 'Unbothered king/queen', iconBg: 'rgba(124,58,237,0.2)' },
      { emoji: '📋', label: '"Let me reorganize everyone\'s schedule"', sub: 'Fix-it mode activated', iconBg: 'rgba(16,185,129,0.2)' },
    ],
  },
  {
    emoji: '✈️',
    question: 'Dream vacation energy?',
    options: [
      { emoji: '🏝️', label: 'Beach & do absolutely nothing', sub: 'Frozen drink in hand', iconBg: 'rgba(14,165,233,0.2)' },
      { emoji: '🗼', label: 'City hopping & street food', sub: 'Every alley, every market', iconBg: 'rgba(249,115,22,0.2)' },
      { emoji: '🏔️', label: 'Mountain cabin vibes', sub: 'Fireplace, stew, silence', iconBg: 'rgba(34,197,94,0.2)' },
      { emoji: '🎭', label: 'Cultural deep-dive', sub: 'Museums, theatre, history', iconBg: 'rgba(124,58,237,0.2)' },
    ],
  },
  {
    emoji: '🍕',
    question: 'Pick a controversial food take:',
    options: [
      { emoji: '🍍', label: 'Pineapple on pizza is elite', sub: 'Sweet + savory = genius', iconBg: 'rgba(234,179,8,0.2)' },
      { emoji: '🥄', label: 'Cereal is a valid dinner', sub: 'Efficient and delicious', iconBg: 'rgba(59,130,246,0.2)' },
      { emoji: '🌶️', label: "If it's not spicy, it's not food", sub: 'Pain is flavor', iconBg: 'rgba(239,68,68,0.2)' },
      { emoji: '🧈', label: 'Butter makes everything better', sub: 'The French were right', iconBg: 'rgba(249,115,22,0.2)' },
    ],
  },
];

/** Index order matters — matched by the scorer in characterEngine.ts (0=Jake,1=Monica,2=Leslie,3=Shaggy). */
export const CHARACTERS: CharacterProfile[] = [
  {
    name: 'Jake Peralta',
    show: 'Brooklyn Nine-Nine',
    emoji: '🕵️',
    bg: ['#1e40af', '#3b82f6'],
    mealEmoji: '🍕',
    mealName: 'Extra Cheesy Pizza',
    mealDesc: 'With orange soda, obviously',
    quote: '"Cool cool cool cool cool. No doubt no doubt."',
    mood: 'happy',
    craving: 'comfort',
    budget: 'medium',
    preference: 'both',
  },
  {
    name: 'Monica Geller',
    show: 'Friends',
    emoji: '👩‍🍳',
    bg: ['#7c3aed', '#a78bfa'],
    mealEmoji: '🍝',
    mealName: 'Perfect Lasagna',
    mealDesc: 'With exactly 14 layers',
    quote: '"I KNOW!" — you, when this meal arrives',
    mood: 'relaxed',
    craving: 'comfort',
    budget: 'medium',
    preference: 'both',
  },
  {
    name: 'Leslie Knope',
    show: 'Parks & Recreation',
    emoji: '🧇',
    bg: ['#b45309', '#f59e0b'],
    mealEmoji: '🧇',
    mealName: 'Waffles & Whipped Cream',
    mealDesc: "From JJ's Diner, naturally",
    quote: '"We need to remember what\'s important: waffles."',
    mood: 'adventurous',
    craving: 'sweet',
    budget: 'medium',
    preference: 'both',
  },
  {
    name: 'Shaggy Rogers',
    show: 'Scooby-Doo',
    emoji: '🐕',
    bg: ['#15803d', '#4ade80'],
    mealEmoji: '🥪',
    mealName: 'Mega Triple-Stack Sub',
    mealDesc: 'With everything. EVERYTHING.',
    quote: '"Like, I\'d do it for a Scooby Snack!"',
    mood: 'relaxed',
    craving: 'comfort',
    budget: 'low',
    preference: 'both',
  },
];

export const TOTAL_CHAR_QUESTIONS = CHAR_QUESTIONS.length;
