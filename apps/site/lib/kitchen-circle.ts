import type { IconName } from './icons';

// KitchenCircle marketing copy. Mirrors what the app ships (apps/mobile/app/kitchen-circle,
// docs/kitchen_circle/kitchencircle-development-status.md). Mock data below is illustrative.

export const KC_TAGLINE = 'One meal. Everyone in.';

/** Day rings in the mocks: cooked (past), today (haldi), planned (outline), blank (dashed). */
export type RingState = 'cooked' | 'today' | 'planned' | 'blank';

export const KC_WEEK: Array<{ day: string; state: RingState; meal: string; note: string }> = [
  { day: 'Mon', state: 'cooked', meal: 'Aloo paratha', note: 'Loved it · 4 of 4' },
  { day: 'Tue', state: 'cooked', meal: 'Leftovers', note: 'No cooking' },
  { day: 'Wed', state: 'today', meal: 'Rajma chawal', note: '3 of 4 eating' },
  { day: 'Thu', state: 'planned', meal: 'Lemon rice', note: 'Quick day · 25 min' },
  { day: 'Fri', state: 'blank', meal: 'Choose a meal', note: 'Haldi has an idea' },
  { day: 'Sat', state: 'planned', meal: 'Chicken curry', note: 'Elaborate meal welcome' },
  { day: 'Sun', state: 'blank', meal: 'Choose a meal', note: 'Eating out?' },
];

export const KC_STEPS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'groups',
    title: 'Plan it together',
    body: 'Invite your family and your cook. Everyone sees one week, says who is eating, and reacts to the menu.',
  },
  {
    icon: 'shopping_bag',
    title: 'Shop once',
    body: 'The week turns into one grocery list, scaled to the people eating and minus what is already in the kitchen.',
  },
  {
    icon: 'soup_kitchen',
    title: 'Cook without the calls',
    body: "Your cook gets tomorrow's menu, ingredients and steps in their own language. No account needed.",
  },
];

export const KC_FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'group',
    title: 'One household, three roles',
    body: 'Owners run the plan, members help shape it, cooks see what to make. Invite by email or phone.',
  },
  {
    icon: 'calendar_today',
    title: 'This week and next',
    body: 'Meal, servings, leftovers, eating out, locked days. Everyone marks “I’m eating” or “I’m out”.',
  },
  {
    icon: 'tune',
    title: 'House rules that stick',
    body: 'Vegetarian Tuesdays, no onion or garlic, quick weeknights, a budget. Every week or just this one.',
  },
  {
    icon: 'auto_awesome',
    title: 'Auto-fill the open days',
    body: 'Respects every diet and allergy, avoids repeats, and explains each pick. Nothing changes until you say yes.',
  },
  {
    icon: 'restaurant',
    title: '75 home recipes, plus yours',
    body: 'Measured Indian recipes from Punjab to Kerala. Save your family’s own, or let AI draft a new one for review.',
  },
  {
    icon: 'receipt_long',
    title: 'A grocery list that adds up',
    body: 'Merges the same ingredient across days, skips pantry staples, and saves fresh produce for later in the week.',
  },
  {
    icon: 'language',
    title: 'Your cook’s language',
    body: 'Hindi, Hinglish, Marathi, Tamil, Telugu, Bengali, Kannada or English, and it can read the menu aloud.',
  },
  {
    icon: 'favorite',
    title: 'Learns what your family loves',
    body: 'Loved it, change something, skipped. Quick check-ins after each meal shape the next week’s ideas.',
  },
];

/** The Haldi chat mock. */
export const KC_CHAT = {
  ask: 'Haldi, make rajma on Wednesday and keep Friday light',
  cards: [
    { status: 'Done', icon: 'check_circle' as IconName, title: 'Wednesday → Rajma chawal', note: 'Everyone eating can have it' },
    { status: 'Confirm', icon: 'help' as IconName, title: 'Friday: quick meal, 30 min or less', note: 'Just this week or every week?' },
  ],
  reply: 'Wednesday is set. For Friday, should the quick meal be just this week or every week?',
};

export const KC_CHAT_POINTS: Array<{ icon: IconName; text: string }> = [
  { icon: 'chat', text: 'Type it or say it. Voice notes work too.' },
  { icon: 'check_circle', text: 'Small changes happen; bigger ones wait for a tap.' },
  { icon: 'warning', text: 'Never plans a dish someone eating can’t have.' },
];

/** The cook-view mock (Hindi). */
export const KC_COOK = {
  languages: ['हिन्दी', 'मराठी', 'தமிழ்', 'తెలుగు', 'বাংলা', 'ಕನ್ನಡ', 'Hinglish', 'English'],
  day: 'कल · गुरुवार',
  dish: 'दाल तड़का',
  people: '4 लोगों के लिए',
  ingredients: ['अरहर दाल — 200 ग्राम', 'टमाटर — 2', 'प्याज़ — 1', 'जीरा — 1 छोटा चम्मच', 'हल्दी — ½ छोटा चम्मच', 'घी — 2 बड़े चम्मच'],
};

export const KC_COOK_POINTS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'link', title: 'One private link', body: 'Shared on WhatsApp or SMS. Expires with the week, and you can turn it off any time.' },
  { icon: 'lock', title: 'Only the menu', body: 'Dish, people, ingredients and steps. Never names, notes, prices or your chats.' },
  { icon: 'notifications', title: 'Sent the night before', body: 'Switch on auto-send and tomorrow’s menu reaches your cook on its own.' },
];

/** The grocery mock. */
export const KC_GROCERY: Array<{ group: string; items: Array<{ name: string; qty: string; from: string }> }> = [
  {
    group: 'Buy now',
    items: [
      { name: 'Rajma', qty: '250 g', from: 'Wed' },
      { name: 'Tomato', qty: '1.2 kg', from: 'Wed · Thu · Sat' },
      { name: 'Chicken', qty: '1.65 kg', from: 'Sat' },
    ],
  },
  {
    group: 'Buy later',
    items: [{ name: 'Coriander', qty: '1 bunch', from: 'Sat' }],
  },
  {
    group: 'Already have',
    items: [{ name: 'Salt, oil, haldi, jeera', qty: '', from: 'Pantry' }],
  },
];

export const KC_FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Is KitchenCircle a separate app?',
    a: 'No. It lives inside MoodFood. Switch to it from the home screen when you’re planning food at home instead of ordering in.',
  },
  {
    q: 'Does my cook need to download anything?',
    a: 'No. Your cook can open a private link on any phone, in their language. If they’d like, they can also join your household in the app.',
  },
  {
    q: 'Who can see my food preferences?',
    a: 'Only you. Your allergies and dislikes shape the plan, but other members never see your list, and your cook never sees anyone’s.',
  },
  {
    q: 'Do I have to order groceries through Swiggy?',
    a: 'No. The grocery list works on its own. Linking Swiggy lets the household owner turn it into an Instamart cart in one go.',
  },
  {
    q: 'When can I use it?',
    a: 'KitchenCircle arrives with MoodFood’s early access. Claim a spot and you’ll get both.',
  },
];
