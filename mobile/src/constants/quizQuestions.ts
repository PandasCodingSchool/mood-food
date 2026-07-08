export interface QuizOption {
  value: string;
  label: string;
  sub: string;
  emoji: string;
}

export interface QuizQuestion {
  emoji: string;
  question: string;
  outputKey: 'mood' | 'craving' | 'budget' | 'time';
  options: QuizOption[];
}

/** Mood Scoop — 4 fixed questions (feeling, craving, budget, time), matches the design 1:1. */
export const MOOD_SCOOP_QUESTIONS: QuizQuestion[] = [
  {
    emoji: '😊',
    question: 'How are you feeling right now?',
    outputKey: 'mood',
    options: [
      { value: 'celebrating', label: 'On top of the world', sub: 'Celebratory vibes', emoji: '🥳' },
      { value: 'relaxed', label: 'Chill & relaxed', sub: 'Low-key energy', emoji: '😌' },
      { value: 'stressed', label: 'Stressed out', sub: 'Need comfort', emoji: '😤' },
      { value: 'tired', label: 'Tired & lazy', sub: 'Zero effort meals', emoji: '😴' },
    ],
  },
  {
    emoji: '🍽️',
    question: 'What kind of craving is hitting?',
    outputKey: 'craving',
    options: [
      { value: 'comfort', label: 'Something hearty', sub: 'Big flavors, big portions', emoji: '🍔' },
      { value: 'healthy', label: 'Light & fresh', sub: 'Clean eating vibes', emoji: '🥗' },
      { value: 'spicy', label: 'Spicy & bold', sub: 'Bring the heat', emoji: '🌶️' },
      { value: 'sweet', label: 'Sweet tooth', sub: 'Dessert-first energy', emoji: '🍰' },
    ],
  },
  {
    emoji: '💰',
    question: "What's your budget looking like?",
    outputKey: 'budget',
    options: [
      { value: 'high', label: "Ballin'", sub: '$30+ per meal', emoji: '💸' },
      { value: 'medium', label: 'Moderate', sub: '$15-30 range', emoji: '💵' },
      { value: 'low', label: 'Budget-friendly', sub: 'Under $15', emoji: '🪙' },
      { value: 'low', label: 'Cook at home', sub: 'Grocery run ideas', emoji: '🆓' },
    ],
  },
  {
    emoji: '⏰',
    question: 'How much time do you have?',
    outputKey: 'time',
    options: [
      { value: 'now', label: 'Need it NOW', sub: 'Fast food / delivery', emoji: '⚡' },
      { value: 'quick', label: '30 minutes', sub: 'Quick cooking or pickup', emoji: '🕐' },
      { value: 'cook', label: 'Got time to cook', sub: '1+ hour recipes', emoji: '👨‍🍳' },
      { value: 'occasion', label: 'Special occasion', sub: 'Worth the wait', emoji: '🎉' },
    ],
  },
];

export const QUIZ_TOTAL_QUESTIONS = MOOD_SCOOP_QUESTIONS.length;
