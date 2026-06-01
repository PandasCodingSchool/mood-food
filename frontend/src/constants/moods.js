export const MOOD_OPTIONS = [
  { value: 'happy', label: 'Happy', emoji: '😊', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'tired', label: 'Tired', emoji: '😴', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'stressed', label: 'Stressed', emoji: '😰', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'celebrating', label: 'Celebrating', emoji: '🥳', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'relaxed', label: 'Relaxed', emoji: '😌', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'adventurous', label: 'Adventurous', emoji: '🤩', color: 'bg-orange-100 text-orange-700 border-orange-200' },
];

export const MOOD_EMOJIS = Object.fromEntries(
  MOOD_OPTIONS.map((m) => [m.value, m.emoji]),
);

/** Numeric dimensions for algorithmic blending (0–1 scale) */
export const MOOD_DIMENSIONS = {
  happy: { energy: 0.85, valence: 0.9, social: 0.6 },
  tired: { energy: 0.2, valence: 0.45, social: 0.25 },
  stressed: { energy: 0.55, valence: 0.2, social: 0.3 },
  celebrating: { energy: 0.95, valence: 0.95, social: 0.95 },
  relaxed: { energy: 0.25, valence: 0.75, social: 0.35 },
  adventurous: { energy: 0.9, valence: 0.85, social: 0.7 },
};

export const CRAVING_OPTIONS = [
  { value: 'spicy', label: 'Spicy', emoji: '🌶️', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'sweet', label: 'Sweet', emoji: '🍯', color: 'bg-pink-100 text-pink-700 border-pink-200' },
  { value: 'comfort', label: 'Comfort Food', emoji: '🍲', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'healthy', label: 'Healthy', emoji: '🥗', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'light', label: 'Light', emoji: '🌿', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { value: 'indulgent', label: 'Indulgent', emoji: '🍰', color: 'bg-purple-100 text-purple-700 border-purple-200' },
];

export const BUDGET_OPTIONS = [
  { value: 'low', label: 'Low', subtitle: 'Under ₹200', emoji: '💰', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'medium', label: 'Medium', subtitle: '₹200 - ₹500', emoji: '💰💰', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'high', label: 'High', subtitle: 'Above ₹500', emoji: '💰💰💰', color: 'bg-orange-100 text-orange-700 border-orange-200' },
];

export const PREFERENCE_OPTIONS = [
  { value: 'veg', label: 'Vegetarian', emoji: '🥬', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'non-veg', label: 'Non-Vegetarian', emoji: '🍗', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'both', label: 'No Preference', emoji: '🍽️', color: 'bg-blue-100 text-blue-700 border-blue-200' },
];

export const QUIZ_QUESTIONS = [
  {
    id: 1,
    key: 'mood',
    question: 'How are you feeling?',
    subtitle: 'Your mood helps us understand what type of food you need right now.',
    options: MOOD_OPTIONS,
  },
  {
    id: 2,
    key: 'craving',
    question: 'What sounds good?',
    subtitle: 'Tell us what kind of flavors you are craving today.',
    options: CRAVING_OPTIONS,
  },
  {
    id: 3,
    key: 'budget',
    question: 'What is your budget?',
    subtitle: 'We will find options that match your spending preference.',
    options: BUDGET_OPTIONS,
  },
  {
    id: 4,
    key: 'preference',
    question: 'Food preference?',
    subtitle: 'Help us filter the best options for you.',
    options: PREFERENCE_OPTIONS,
  },
];

export function getMoodByValue(value) {
  return MOOD_OPTIONS.find((m) => m.value === value);
}
