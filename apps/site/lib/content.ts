import type { IconName } from './icons';

export const STEPS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'mood', title: 'Check in', body: 'Four taps: energy, stress, hunger, company. MoodFood already knows the time and the weather.' },
  { icon: 'stadia_controller', title: 'Play for 30 seconds', body: 'Swipe, spin, or pick between pairs. Every answer tunes what you get.' },
  { icon: 'restaurant', title: 'Eat something you want', body: 'Three dishes, each with a reason. Order on Swiggy in the app, or cook it yourself.' },
];

// Mirrors apps/mobile/src/constants/games.ts (the shipped games).
export const GAMES: Array<{ title: string; desc: string; time: string; icon: IconName; hue: number; tag?: string }> = [
  { title: 'Snack Match', desc: 'Swipe food cards until your cravings click.', time: '1 min', icon: 'swipe', hue: 40, tag: 'Popular' },
  { title: 'Meal Roulette', desc: 'Spin for a meal vibe. Accept or roll again.', time: '30 sec', icon: 'casino', hue: 350 },
  { title: 'Mood Scoop', desc: 'Three questions, one perfect bowl.', time: '30 sec', icon: 'icecream', hue: 220 },
  { title: 'This or That', desc: 'Rapid-fire pairs until one wins.', time: '45 sec', icon: 'compare_arrows', hue: 140 },
  { title: 'Craving Radar', desc: "Tap what you're craving on a flavour map.", time: '10 sec', icon: 'radar', hue: 270 },
  { title: 'Story mode', desc: "Tell us your day, we'll plate it.", time: '1 min', icon: 'auto_stories', hue: 310, tag: 'New' },
  { title: 'Bracket', desc: 'Eight dishes, knockout rounds.', time: '1 min', icon: 'account_tree', hue: 95 },
  { title: 'Pantry mode', desc: "Cook with what's already at home.", time: '1 min', icon: 'kitchen', hue: 65 },
];

export const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'two_wheeler', title: 'Order without switching apps', body: 'Live menus, cart, coupons and order tracking from your linked Swiggy account.' },
  { icon: 'insights', title: 'Learns your taste', body: 'Every swipe and every "how did that feel?" sharpens the next pick. No long setup quiz.' },
  { icon: 'skillet', title: 'Cook it instead', body: 'Get a recipe for any pick, see what is missing from your pantry, and fill the gap on Instamart.' },
  { icon: 'local_fire_department', title: 'Streaks and quests', body: 'Daily mood streaks and taste quests that nudge you past your usual five orders.' },
  { icon: 'eco', title: 'Respects your diet', body: 'Vegetarian, vegan, gluten-free, allergies and budget apply to every recommendation.' },
  { icon: 'lock', title: 'Your mood stays yours', body: 'Mood data stays on your account and is never sold. Story mode reads your text on the phone.' },
];

export const FAQ: Array<{ q: string; a: string }> = [
  { q: 'Is MoodFood free?', a: 'Yes. You pay only for what you order or buy, at the usual Swiggy prices.' },
  { q: 'Do I need a Swiggy account?', a: 'Only to order in the app. Recommendations, games and recipes work without one, and you can link Swiggy any time.' },
  { q: 'When can I get the app?', a: 'MoodFood is coming soon to the App Store and Google Play. The first 100 people on the waitlist get free early access before launch.' },
  { q: 'Where does it work?', a: 'In India, wherever Swiggy delivers. Ordering is powered by Swiggy.' },
  { q: 'How does it know my mood?', a: 'You tell it, in a four-tap check-in or a quick game. It also reads the local time and weather.' },
];
