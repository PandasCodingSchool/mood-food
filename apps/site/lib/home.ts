import type { Mood } from '@moodfood/tokens';
import { KC_WEEK, type RingState } from './kitchen-circle';

// Home page: MoodFood (tonight, order in) and KitchenCircle (this week, cook at home)
// shown side by side as equals. All mock data is illustrative, not live.

export const MOOD_ORDER: Mood[] = ['tired', 'hungry', 'happy', 'stressed', 'adventurous'];

/** One stream for both products under the hero. */
export const DUAL_TICKER: Array<{ tag: 'MoodFood' | 'KitchenCircle'; moment: string; dish: string }> = [
  { tag: 'MoodFood', moment: 'Tired + rainy', dish: 'Masala khichdi' },
  { tag: 'KitchenCircle', moment: 'Wednesday · 4 eating', dish: 'Rajma chawal' },
  { tag: 'MoodFood', moment: 'Stressed + 2 AM', dish: 'Pepper rasam' },
  { tag: 'KitchenCircle', moment: 'Veg Tuesday', dish: 'Palak paneer' },
  { tag: 'MoodFood', moment: 'Happy + Friday', dish: 'Hyderabadi biryani' },
  { tag: 'KitchenCircle', moment: 'Quick weeknight · 25 min', dish: 'Lemon rice' },
  { tag: 'MoodFood', moment: 'Hungover + Sunday', dish: 'Masala dosa' },
  { tag: 'KitchenCircle', moment: 'Guests Saturday · serves 8', dish: 'Chicken curry' },
];

/** The three MoodFood games named in its chapter. */
export const MF_GAMES = [
  { title: 'Snack Match', desc: 'Swipe till it clicks' },
  { title: 'Meal Roulette', desc: 'Spin mood-matched picks' },
  { title: 'Bracket', desc: 'Eight dishes, one winner' },
] as const;

export type HaldiCard = { status: 'Done' | 'Confirm'; title: string; note: string };

/** What Haldi did for each day of the example week (indexes match KC_WEEK). */
const HALDI_BY_DAY: Array<{ ask: string; cards: HaldiCard[]; reply: string }> = [
  {
    ask: 'Haldi, parathas on Monday?',
    cards: [{ status: 'Done', title: 'Monday → Aloo paratha', note: 'Everyone eating can have it' }],
    reply: 'Monday is aloo paratha. All four loved it.',
  },
  {
    ask: 'We have dal left, skip cooking Tuesday',
    cards: [{ status: 'Done', title: 'Tuesday → Leftovers', note: 'Nothing new to buy' }],
    reply: 'Tuesday is leftovers. The cook gets the night off.',
  },
  {
    ask: 'Haldi, make rajma on Wednesday and keep Friday light',
    cards: [
      { status: 'Done', title: 'Wednesday → Rajma chawal', note: 'Everyone eating can have it' },
      { status: 'Confirm', title: 'Friday: quick meal, 30 min or less', note: 'Just this week or every week?' },
    ],
    reply: 'Wednesday is set. For Friday, should the quick meal be just this week or every week?',
  },
  {
    ask: 'Something quick on Thursday',
    cards: [{ status: 'Done', title: 'Thursday → Lemon rice', note: '25 min · uses leftover rice' }],
    reply: 'Thursday is lemon rice, ready in 25 minutes.',
  },
  {
    ask: 'Haldi, pav bhaji on Friday',
    cards: [{ status: 'Done', title: 'Friday → Pav bhaji', note: 'Adds pav, capsicum and lemon to the list' }],
    reply: 'Pav bhaji is on Friday.',
  },
  {
    ask: 'Guests on Saturday, make it special',
    cards: [{ status: 'Confirm', title: 'Saturday → serves 8', note: 'Doubles the chicken and rice' }],
    reply: 'Shall I scale Saturday to eight people?',
  },
  {
    ask: "We're going out on Sunday",
    cards: [{ status: 'Done', title: 'Household out on Sunday', note: 'No cooking, nothing to buy' }],
    reply: 'You’re marked as eating out on Sunday.',
  },
];

export const KC_DAYS: Array<{ day: string; state: RingState; meal: string; note: string; ask: string; cards: HaldiCard[]; reply: string }> =
  KC_WEEK.map((d, i) => ({ ...d, ...HALDI_BY_DAY[i] }));

/** Index of "today" in the example week. */
export const KC_TODAY = KC_DAYS.findIndex((d) => d.state === 'today');

/** Cook view, switchable by language. */
export const COOK_LANGS: Array<{ id: string; label: string; lang: string; day: string; dish: string; people: string; items: string[]; listen: string }> = [
  {
    id: 'hi',
    label: 'हिन्दी',
    lang: 'hi',
    day: 'कल · गुरुवार',
    dish: 'दाल तड़का',
    people: '4 लोगों के लिए',
    items: ['अरहर दाल — 200 ग्राम', 'टमाटर — 2', 'प्याज़ — 1', 'जीरा — 1 छोटा चम्मच', 'हल्दी — ½ छोटा चम्मच', 'घी — 2 बड़े चम्मच'],
    listen: 'सामग्री सुनें',
  },
  {
    id: 'mr',
    label: 'मराठी',
    lang: 'mr',
    day: 'उद्या · गुरुवार',
    dish: 'डाळ तडका',
    people: '4 जणांसाठी',
    items: ['तूर डाळ — 200 ग्रॅम', 'टोमॅटो — 2', 'कांदा — 1', 'जिरे — 1 छोटा चमचा', 'हळद — ½ छोटा चमचा', 'तूप — 2 मोठे चमचे'],
    listen: 'साहित्य ऐका',
  },
  {
    id: 'ta',
    label: 'தமிழ்',
    lang: 'ta',
    day: 'நாளை · வியாழன்',
    dish: 'தால் தட்கா',
    people: '4 பேருக்கு',
    items: ['துவரம் பருப்பு — 200 கி', 'தக்காளி — 2', 'வெங்காயம் — 1', 'சீரகம் — 1 டீஸ்பூன்', 'மஞ்சள் — ½ டீஸ்பூன்', 'நெய் — 2 டேபிள்ஸ்பூன்'],
    listen: 'பொருட்களைக் கேளுங்கள்',
  },
  {
    id: 'hinglish',
    label: 'Hinglish',
    lang: 'en',
    day: 'Kal · Guruvaar',
    dish: 'Dal tadka',
    people: '4 logon ke liye',
    items: ['Arhar dal — 200 g', 'Tamatar — 2', 'Pyaaz — 1', 'Jeera — 1 chhota chammach', 'Haldi — ½ chhota chammach', 'Ghee — 2 bade chammach'],
    listen: 'Saamagri suniye',
  },
  {
    id: 'en',
    label: 'English',
    lang: 'en',
    day: 'Tomorrow · Thursday',
    dish: 'Dal tadka',
    people: 'For 4 people',
    items: ['Toor dal — 200 g', 'Tomatoes — 2', 'Onion — 1', 'Cumin — 1 tsp', 'Turmeric — ½ tsp', 'Ghee — 2 tbsp'],
    listen: 'Listen: ingredients',
  },
];

/** "What are you most excited about?" on the early-access form. */
export const DOORS = [
  { id: 'both', label: 'Both', note: 'Order on tired nights, cook together the rest' },
  { id: 'moodfood', label: 'MoodFood', note: 'Mood-matched dinners from Swiggy' },
  { id: 'kitchencircle', label: 'KitchenCircle', note: 'Plan the week with family and your cook' },
] as const;

export type Door = (typeof DOORS)[number]['id'];
