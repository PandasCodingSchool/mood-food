import type { Mood } from '@moodfood/tokens';
import type { IconName } from './icons';

/** Hero photo wall (public/food). */
export const HERO_PHOTOS = [
  'butter-chicken',
  'masala-dosa',
  'biryani',
  'samosa',
  'dosa-leaf',
  'thali',
  'banana-leaf',
  'feast',
] as const;

/** "Mood + moment → dish" marquee under the hero. */
export const TICKER: Array<[string, string]> = [
  ['Tired + rainy', 'Masala khichdi'],
  ['Happy + Friday', 'Hyderabadi biryani'],
  ['Stressed + 2 AM', 'Pepper rasam'],
  ['Adventurous + sunny', 'Korean fried chicken'],
  ['Hungover + Sunday', 'Masala dosa'],
  ['Celebrating', 'Gulab jamun'],
  ['Post-gym', 'Paneer tikka bowl'],
  ['Month end', 'Samosa ×2'],
];

// Illustrative picks for the hero phone, one per mood. Not live data.
export const PHONE_PICKS: Record<Mood, { dish: string; meta: string; why: string; match: number; photo: string }> = {
  tired: { dish: 'Masala Khichdi', meta: 'Comfort · 30 min · ₹180', why: 'Warm, soft and no effort. Bed by ten.', match: 96, photo: 'khichdi' },
  happy: { dish: 'Hyderabadi Biryani', meta: 'Mughlai · 35 min · ₹320', why: 'Loud, layered and made for good news.', match: 92, photo: 'biryani' },
  stressed: { dish: 'Curd Rice Meal', meta: 'South Indian · 20 min · ₹160', why: 'Cool, calm and gentle on a long day.', match: 89, photo: 'banana-leaf' },
  adventurous: { dish: 'Chettinad Thali', meta: 'Regional · 40 min · ₹360', why: 'Ten bowls, ten flavours. Something new.', match: 87, photo: 'thali' },
};

export const SIGNALS: Array<{ icon: IconName; hue: number; title: string; body: string; example: string; photo: string }> = [
  {
    icon: 'mood',
    hue: 70,
    title: 'Your mood',
    body: 'A 20-second check-in on energy, stress, hunger and company. Four taps, no essays.',
    example: 'Tired and a bit stressed → slow-cooked, warm, zero-effort.',
    photo: 'khichdi',
  },
  {
    icon: 'rainy',
    hue: 230,
    title: 'The weather',
    body: 'Rain, heat, storms. Your picks shift with the sky outside your window.',
    example: 'Pouring outside → pepper rasam and something hot.',
    photo: 'banana-leaf',
  },
  {
    icon: 'schedule',
    hue: 330,
    title: 'The time',
    body: 'Breakfast, desk lunch, 2 AM cravings. The whole app re-themes from sunrise to late night.',
    example: '8 AM, rushing out → a crisp dosa in 20 minutes.',
    photo: 'masala-dosa',
  },
];

export const STEPS: Array<{ title: string; body: string }> = [
  { title: 'Check in', body: 'Tap how you feel. MoodFood blends it with the weather and the time of day.' },
  { title: 'See your match', body: 'Your best picks, each with the reason it fits. Not in the mood? Play a quick game instead.' },
  { title: 'Order on Swiggy', body: 'Checkout without leaving the app. Track the order live, then tell us how you felt after.' },
];

// Mirrors apps/mobile/src/constants/games.ts.
export const GAMES: Array<{ title: string; desc: string; icon: IconName; hue: number; soon?: boolean }> = [
  { title: 'Snack Match', desc: 'Swipe food cards until your cravings click.', icon: 'swipe', hue: 40 },
  { title: 'Meal Roulette', desc: 'Spin a wheel of mood-matched picks.', icon: 'casino', hue: 350 },
  { title: 'Mood Scoop', desc: 'Three questions, one perfect bowl.', icon: 'icecream', hue: 220 },
  { title: 'Group decide', desc: 'Everyone votes, one winner.', icon: 'groups', hue: 180, soon: true },
  { title: 'This or That', desc: 'Rapid-fire pairs until one wins.', icon: 'compare_arrows', hue: 140 },
  { title: 'Craving Radar', desc: 'Tap your craving on a flavour map.', icon: 'radar', hue: 270 },
  { title: 'Bracket', desc: 'Eight dishes, knockout rounds.', icon: 'account_tree', hue: 95 },
  { title: 'Story mode', desc: "Tell us your day, we'll plate it.", icon: 'auto_stories', hue: 310 },
  { title: 'Pantry mode', desc: "Cook with what's already at home.", icon: 'kitchen', hue: 65 },
];

export const SWIGGY_POINTS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'storefront', title: 'Every restaurant you love', body: 'MoodFood picks from the Swiggy restaurants near you. Nothing new to learn, nothing to switch.' },
  { icon: 'receipt_long', title: 'Live menus and prices', body: 'Menus, prices and carts come straight from Swiggy, so what you see is what the restaurant has right now.' },
  { icon: 'two_wheeler', title: 'Checkout and riders you trust', body: 'Payments, delivery and live tracking run on Swiggy, exactly like you are used to.' },
];

export const PERKS: Array<{ icon: IconName; text: string }> = [
  { icon: 'bolt', text: 'App access before the public launch' },
  { icon: 'workspace_premium', text: 'Free early access for the first 100' },
  { icon: 'chat', text: 'An early say in what we build next' },
];

export const FAQ: Array<{ q: string; a: string }> = [
  { q: 'Do I need a Swiggy account?', a: 'Only to order in the app. Recommendations, games and recipes work without one, and you can link Swiggy any time.' },
  { q: 'What happens to my mood data?', a: 'It stays on your account and is only used to improve your picks. We never sell it, and deleting your account from Settings erases it.' },
  { q: 'Is it free?', a: 'Yes. You only pay for the food you order, at the usual Swiggy prices.' },
  { q: 'When can I get the app?', a: "MoodFood is coming soon to iPhone and Android. The first 100 people on the list get free early access before launch, and we'll email you the moment yours is ready." },
  { q: 'Where does it work?', a: 'In India, wherever Swiggy delivers.' },
];

export const RULES: Array<{ icon: IconName; hue: number; title: string; body: string }> = [
  { icon: 'bolt', hue: 70, title: 'Decide in seconds', body: 'If choosing takes longer than eating, we failed. Clear picks, with the reason, every time.' },
  { icon: 'favorite', hue: 20, title: 'Feel better after', body: "We ask how you felt after each meal, and we tune for that, not just what's popular." },
  { icon: 'lock', hue: 230, title: 'Your mood is yours', body: 'Check-ins stay private to your account. We never sell them and you can delete them any time.' },
  { icon: 'celebration', hue: 150, title: 'Keep it fun', body: "Games, streaks and quests, because deciding dinner shouldn't feel like homework." },
];
