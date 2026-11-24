import type { Mood } from '@moodfood/tokens';
import type { IconName } from './icons';

// Illustrative MoodFood picks (home hero and chapter), one per mood. Not live data.
export const PHONE_PICKS: Record<Mood, { dish: string; meta: string; why: string; match: number; photo: string }> = {
  tired: { dish: 'Masala Khichdi', meta: 'Comfort · 30 min · ₹180', why: 'Warm, soft and no effort. Bed by ten.', match: 96, photo: 'khichdi' },
  hungry: { dish: 'Butter Chicken Meal', meta: 'North Indian · 30 min · ₹290', why: 'Rich, filling and on its way fast.', match: 94, photo: 'butter-chicken' },
  happy: { dish: 'Hyderabadi Biryani', meta: 'Mughlai · 35 min · ₹320', why: 'Loud, layered and made for good news.', match: 92, photo: 'biryani' },
  stressed: { dish: 'Curd Rice Meal', meta: 'South Indian · 20 min · ₹160', why: 'Cool, calm and gentle on a long day.', match: 89, photo: 'banana-leaf' },
  adventurous: { dish: 'Chettinad Thali', meta: 'Regional · 40 min · ₹360', why: 'Ten bowls, ten flavours. Something new.', match: 87, photo: 'thali' },
};

export const FAQ: Array<{ q: string; a: string }> = [
  { q: 'What are MoodFood and KitchenCircle?', a: 'Two ways to eat, in one app. MoodFood is for tonight: tell it how you feel and it picks a dish to order on Swiggy. KitchenCircle is for the week: plan home cooking with your family and your cook, with one grocery list and the menu in your cook’s language.' },
  { q: 'Do I have to use both?', a: 'No. Use either one on its own, or both. Your diets, allergies and favourite cuisines are set once and shared, so each gets smarter from the other.' },
  { q: 'Do I need a Swiggy account?', a: 'Only to order. MoodFood’s picks and games and KitchenCircle’s plans and grocery lists work without one. Link Swiggy to order food, or to turn the week’s list into an Instamart cart.' },
  { q: 'What happens to my data?', a: 'Mood check-ins and household preferences stay on your account and only improve your picks and plans. We never sell them, and deleting your account from Settings erases them. Your cook only ever sees the menu.' },
  { q: 'Is it free?', a: 'Yes. You only pay for the food and groceries you order, at the usual Swiggy prices.' },
  { q: 'When can I get the app?', a: "Coming soon to iPhone and Android. The first 100 people on the list get free early access to both MoodFood and KitchenCircle before launch, and we'll email you the moment yours is ready." },
  { q: 'Where does it work?', a: 'In India, wherever Swiggy delivers.' },
];

export const RULES: Array<{ icon: IconName; hue: number; title: string; body: string }> = [
  { icon: 'bolt', hue: 70, title: 'Decide in seconds', body: 'If choosing takes longer than eating, we failed. Clear picks, with the reason, every time.' },
  { icon: 'favorite', hue: 20, title: 'Feel better after', body: "We ask how you felt after each meal, and we tune for that, not just what's popular." },
  { icon: 'lock', hue: 230, title: 'Your mood is yours', body: 'Check-ins stay private to your account. We never sell them and you can delete them any time.' },
  { icon: 'celebration', hue: 150, title: 'Keep it fun', body: "Games, streaks and quests, because deciding dinner shouldn't feel like homework." },
];
