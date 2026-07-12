export interface OnboardFeature {
  emoji: string;
  text: string;
}

export interface OnboardStep {
  mainEmoji: string;
  orbit: [string, string, string, string];
  tag: string;
  title: string;
  desc: string;
  colors: readonly [string, string];
  tagBg: string;
  tagColor: string;
  btnColors: readonly [string, string];
  features: OnboardFeature[] | null;
}

/** Matches the design's exact 4 onboarding steps. */
export const ONBOARD_STEPS: OnboardStep[] = [
  {
    mainEmoji: '🎮',
    orbit: ['🍕', '🎲', '🃏', '🎰'],
    tag: 'Step 1',
    title: 'Play a game, discover your craving',
    desc: 'Five fun mini-games read your mood and figure out exactly what you want to eat tonight.',
    colors: ['#1e1b4b', '#312e81'],
    tagBg: 'rgba(167,139,250,0.2)',
    tagColor: '#c4b5fd',
    btnColors: ['#7c3aed', '#a78bfa'],
    features: [
      { emoji: '🎭', text: 'Character Match — which TV character eats like you?' },
      { emoji: '🎡', text: 'Meal Roulette — spin & let fate decide' },
      { emoji: '👆', text: 'Snack Match — swipe your way to dinner' },
    ],
  },
  {
    mainEmoji: '🤖',
    orbit: ['⚡', '🧠', '💡', '🎯'],
    tag: 'Step 2',
    title: 'AI picks your perfect meal',
    desc: 'Our AI reads your vibe and matches it to 3 curated meals — tuned to your budget, diet, and mood.',
    colors: ['#0c4a6e', '#0891b2'],
    tagBg: 'rgba(34,211,238,0.2)',
    tagColor: '#67e8f9',
    btnColors: ['#0891b2', '#22d3ee'],
    features: null,
  },
  {
    mainEmoji: '🔄',
    orbit: ['💚', '💰', '🥗', '🛒'],
    tag: 'Step 3',
    title: 'Swap, save & order instantly',
    desc: 'Every pick comes with a healthier swap and a budget-friendly alternative. Tap to order.',
    colors: ['#14532d', '#16a34a'],
    tagBg: 'rgba(74,222,128,0.2)',
    tagColor: '#86efac',
    btnColors: ['#16a34a', '#4ade80'],
    features: [
      { emoji: '🥗', text: 'Healthier swap — same vibe, lighter choice' },
      { emoji: '💰', text: 'Budget pick — delicious for less' },
      { emoji: '🛒', text: 'One-tap ordering via your fav delivery app' },
    ],
  },
  {
    mainEmoji: '🍽️',
    orbit: ['🔥', '✨', '🎉', '💛'],
    tag: 'Ready',
    title: 'From hungry to eating in 90 seconds',
    desc: 'No more scrolling menus. Just play, pick, and eat.',
    colors: ['#7c2d12', '#f97316'],
    tagBg: 'rgba(251,191,36,0.2)',
    tagColor: '#fde68a',
    btnColors: ['#f97316', '#fbbf24'],
    features: null,
  },
];
