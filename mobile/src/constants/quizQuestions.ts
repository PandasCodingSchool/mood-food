export interface QuizOption {
  value: string;
  label: string;
  emoji: string;
  color?: string;
  subtitle?: string;
  next?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  subtitle: string;
  outputKey: 'mood' | 'craving' | 'budget' | 'preference';
  options: QuizOption[];
}

export const QUIZ_QUESTION_BANK: Record<string, QuizQuestion> = {
  q1_mood: {
    id: 'q1_mood',
    question: 'How are you feeling?',
    subtitle: 'Your mood helps us understand what type of food you need.',
    outputKey: 'mood',
    options: [
      { value: 'happy', label: 'Happy', emoji: '😊', next: 'q2_happy' },
      { value: 'tired', label: 'Tired', emoji: '😴', next: 'q2_tired' },
      { value: 'stressed', label: 'Stressed', emoji: '😰', next: 'q2_stressed' },
      { value: 'celebrating', label: 'Celebrating', emoji: '🥳', next: 'q2_celebrating' },
      { value: 'relaxed', label: 'Relaxed', emoji: '😌', next: 'q2_relaxed' },
      { value: 'adventurous', label: 'Adventurous', emoji: '🤩', next: 'q2_adventurous' },
    ],
  },
  q2_happy: {
    id: 'q2_happy',
    question: 'Good energy! What sounds good tonight?',
    subtitle: 'Match the vibe — what are you genuinely craving?',
    outputKey: 'craving',
    options: [
      { value: 'indulgent', label: 'Something indulgent', emoji: '🍰', next: 'q3_budget' },
      { value: 'spicy', label: 'Spicy & fun', emoji: '🌶️', next: 'q3_budget' },
      { value: 'comfort', label: 'Classic comfort', emoji: '🍕', next: 'q3_budget' },
      { value: 'healthy', label: 'Fresh & light', emoji: '🥗', next: 'q3_budget' },
    ],
  },
  q2_tired: {
    id: 'q2_tired',
    question: 'Low energy. What would actually help?',
    subtitle: "No judgment — what does your body really want right now?",
    outputKey: 'craving',
    options: [
      { value: 'comfort', label: 'Warm & comforting', emoji: '🍲', next: 'q3_budget' },
      { value: 'light', label: 'Light & easy', emoji: '🥙', next: 'q3_budget' },
      { value: 'sweet', label: 'A little sugar boost', emoji: '🍫', next: 'q3_budget' },
      { value: 'healthy', label: 'Nourishing reset', emoji: '🥗', next: 'q3_budget' },
    ],
  },
  q2_stressed: {
    id: 'q2_stressed',
    question: 'Stressed out. What kind of fix are you after?',
    subtitle: "Food helps. Let's find the right one.",
    outputKey: 'craving',
    options: [
      { value: 'comfort', label: 'Comfort first', emoji: '🍲', next: 'q3_budget' },
      { value: 'spicy', label: 'Spicy release', emoji: '🌶️', next: 'q3_budget' },
      { value: 'sweet', label: 'Sweet escape', emoji: '🍩', next: 'q3_budget' },
      { value: 'light', label: 'Light & calm', emoji: '🌿', next: 'q3_budget' },
    ],
  },
  q2_celebrating: {
    id: 'q2_celebrating',
    question: 'Celebration mode! What matches the moment?',
    subtitle: 'Tonight is special — what does it call for?',
    outputKey: 'craving',
    options: [
      { value: 'indulgent', label: 'Full indulgence', emoji: '🦞', next: 'q3_budget' },
      { value: 'spicy', label: 'Bold & flavourful', emoji: '🌶️', next: 'q3_budget' },
      { value: 'comfort', label: 'Crowd-pleasing comfort', emoji: '🍕', next: 'q3_budget' },
      { value: 'light', label: 'Light but elegant', emoji: '🥙', next: 'q3_budget' },
    ],
  },
  q2_relaxed: {
    id: 'q2_relaxed',
    question: 'Chill mode. What fits the vibe?',
    subtitle: 'No rush, no stress. What sounds just right?',
    outputKey: 'craving',
    options: [
      { value: 'healthy', label: 'Something wholesome', emoji: '🥗', next: 'q3_budget' },
      { value: 'light', label: 'Light & breezy', emoji: '🌿', next: 'q3_budget' },
      { value: 'comfort', label: 'Slow & comforting', emoji: '🍲', next: 'q3_budget' },
      { value: 'sweet', label: 'A sweet treat', emoji: '🍮', next: 'q3_budget' },
    ],
  },
  q2_adventurous: {
    id: 'q2_adventurous',
    question: "Adventurous! How bold are we going?",
    subtitle: "You're up for anything — what calls you most?",
    outputKey: 'craving',
    options: [
      { value: 'spicy', label: 'Fiery & intense', emoji: '🔥', next: 'q3_budget' },
      { value: 'indulgent', label: 'Rich & decadent', emoji: '🍰', next: 'q3_budget' },
      { value: 'healthy', label: 'New & nutritious', emoji: '🥗', next: 'q3_budget' },
      { value: 'light', label: 'Curious & light', emoji: '🌮', next: 'q3_budget' },
    ],
  },
  q3_budget: {
    id: 'q3_budget',
    question: "What's your spending mood tonight?",
    subtitle: "We'll find the best options in your range.",
    outputKey: 'budget',
    options: [
      { value: 'low', label: 'Budget', subtitle: 'Under ₹200', emoji: '💰', next: 'q4_preference' },
      { value: 'medium', label: 'Moderate', subtitle: '₹200 – ₹500', emoji: '💰💰', next: 'q4_preference' },
      { value: 'high', label: 'Splurge', subtitle: 'Above ₹500', emoji: '💰💰💰', next: 'q4_preference' },
    ],
  },
  q4_preference: {
    id: 'q4_preference',
    question: 'Any dietary preference?',
    subtitle: 'Help us filter the best options for you.',
    outputKey: 'preference',
    options: [
      { value: 'veg', label: 'Vegetarian', emoji: '🥬' },
      { value: 'non-veg', label: 'Non-Vegetarian', emoji: '🍗' },
      { value: 'both', label: 'No Preference', emoji: '🍽️' },
    ],
  },
};

export const QUIZ_FIRST_QUESTION_ID = 'q1_mood';
export const QUIZ_TOTAL_QUESTIONS = 4;
