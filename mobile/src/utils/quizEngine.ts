export type DayPart = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'late-night';
export type QuizOutputKey = 'mood' | 'craving' | 'budget' | 'time';

export interface QuizOption {
  value: string;
  label: string;
  sub: string;
  emoji: string;
}

export interface QuizQuestion {
  id: string;
  emoji: string;
  question: string;
  outputKey: QuizOutputKey;
  options: QuizOption[];
}

export function getDayPart(): DayPart {
  const hour = new Date().getHours();
  if (hour < 11) return 'morning';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'late-night';
}

export function getDayPartGreeting(part: DayPart): string {
  switch (part) {
    case 'morning': return 'Good morning';
    case 'lunch': return 'Lunchtime';
    case 'afternoon': return 'Good afternoon';
    case 'evening': return 'Good evening';
    case 'late-night': return 'Late night';
  }
}

export function buildDynamicQuestions(answers: Record<string, string>): QuizQuestion[] {
  const dayPart = getDayPart();
  const questions: QuizQuestion[] = [];

  // 1. Time-aware greeting + mood
  questions.push({
    id: 'mood',
    emoji: dayPart === 'morning' ? '🌅' : dayPart === 'lunch' ? '🍱' : dayPart === 'afternoon' ? '☕' : dayPart === 'evening' ? '🌙' : '🌌',
    question: `${getDayPartGreeting(dayPart)} — how are you feeling right now?`,
    outputKey: 'mood',
    options: [
      { value: 'celebrating', label: 'On top of the world', sub: 'Celebratory vibes', emoji: '🥳' },
      { value: 'relaxed', label: 'Chill & relaxed', sub: 'Low-key energy', emoji: '😌' },
      { value: 'stressed', label: 'Stressed out', sub: 'Need comfort', emoji: '😤' },
      { value: 'tired', label: 'Tired & lazy', sub: 'Zero effort meals', emoji: '😴' },
    ],
  });

  // 2. Craving — base + adaptive label
  const cravingQuestion = buildCravingQuestion(answers.mood, dayPart);
  questions.push(cravingQuestion);

  // 3. Budget — adaptive based on mood + craving
  questions.push(buildBudgetQuestion(answers.mood, answers.craving, dayPart));

  // 4. Time — adaptive based on dayPart and previous choices
  questions.push(buildTimeQuestion(answers.mood, answers.craving, dayPart));

  return questions;
}

function buildCravingQuestion(mood: string | undefined, dayPart: DayPart): QuizQuestion {
  if (dayPart === 'morning') {
    return {
      id: 'craving',
      emoji: '🥞',
      question: 'What sounds good this morning?',
      outputKey: 'craving',
      options: [
        { value: 'sweet', label: 'Sweet breakfast', sub: 'Pancakes, pastries, fruit', emoji: '🥞' },
        { value: 'comfort', label: 'Hearty & savory', sub: 'Eggs, toast, breakfast bowls', emoji: '🍳' },
        { value: 'healthy', label: 'Light & fresh', sub: 'Smoothies, yogurt, oats', emoji: '🥣' },
        { value: 'spicy', label: 'Bold flavors', sub: 'Spicy omelets, wraps, chai', emoji: '🌶️' },
      ],
    };
  }

  if (dayPart === 'late-night') {
    return {
      id: 'craving',
      emoji: '🍜',
      question: 'It\'s late — what kind of bite are you after?',
      outputKey: 'craving',
      options: [
        { value: 'comfort', label: 'Late-night comfort', sub: 'Pizza, burgers, fries', emoji: '🍕' },
        { value: 'spicy', label: 'Spicy kick', sub: 'Ramen, noodles, street food', emoji: '🌶️' },
        { value: 'sweet', label: 'Midnight sweet', sub: 'Ice cream, cookies, shakes', emoji: '🍪' },
        { value: 'healthy', label: 'Light snack', sub: 'Nuts, fruit, yogurt', emoji: '🍎' },
      ],
    };
  }

  if (mood === 'stressed') {
    return {
      id: 'craving',
      emoji: '🍫',
      question: 'Comfort incoming — what are you craving?',
      outputKey: 'craving',
      options: [
        { value: 'comfort', label: 'Something hearty', sub: 'Big flavors, big portions', emoji: '🍔' },
        { value: 'spicy', label: 'Spicy & bold', sub: 'Bring the heat', emoji: '🌶️' },
        { value: 'sweet', label: 'Sweet tooth', sub: 'Dessert-first energy', emoji: '🍰' },
        { value: 'healthy', label: 'Surprisingly clean', sub: 'Healthy comfort food', emoji: '🥗' },
      ],
    };
  }

  return {
    id: 'craving',
    emoji: '🍽️',
    question: 'What kind of craving is hitting?',
    outputKey: 'craving',
    options: [
      { value: 'comfort', label: 'Something hearty', sub: 'Big flavors, big portions', emoji: '🍔' },
      { value: 'healthy', label: 'Light & fresh', sub: 'Clean eating vibes', emoji: '🥗' },
      { value: 'spicy', label: 'Spicy & bold', sub: 'Bring the heat', emoji: '🌶️' },
      { value: 'sweet', label: 'Sweet tooth', sub: 'Dessert-first energy', emoji: '🍰' },
    ],
  };
}

function buildBudgetQuestion(mood: string | undefined, craving: string | undefined, dayPart: DayPart): QuizQuestion {
  if (mood === 'tired' || dayPart === 'late-night') {
    return {
      id: 'budget',
      emoji: '💰',
      question: 'Budget check — what works tonight?',
      outputKey: 'budget',
      options: [
        { value: 'low', label: 'Cheap & quick', sub: 'Under $10, ready fast', emoji: '🪙' },
        { value: 'medium', label: 'Reasonable', sub: '$10-20 range', emoji: '💵' },
        { value: 'high', label: 'Worth it', sub: 'Treat yourself', emoji: '💸' },
      ],
    };
  }

  if (craving === 'sweet') {
    return {
      id: 'budget',
      emoji: '💸',
      question: 'How fancy is your sweet treat?',
      outputKey: 'budget',
      options: [
        { value: 'low', label: 'Quick sugar fix', sub: 'Candy, cookies, local bakery', emoji: '🍪' },
        { value: 'medium', label: 'Nice dessert', sub: 'Premium ice cream or pastries', emoji: '🍦' },
        { value: 'high', label: 'Full indulgence', sub: 'Artisan desserts, tasting menu', emoji: '🍰' },
      ],
    };
  }

  return {
    id: 'budget',
    emoji: '💰',
    question: "What's your budget looking like?",
    outputKey: 'budget',
    options: [
      { value: 'high', label: "Ballin'", sub: '$30+ per meal', emoji: '💸' },
      { value: 'medium', label: 'Moderate', sub: '$15-30 range', emoji: '💵' },
      { value: 'low', label: 'Budget-friendly', sub: 'Under $15', emoji: '🪙' },
      { value: 'low', label: 'Cook at home', sub: 'Grocery run ideas', emoji: '🆓' },
    ],
  };
}

function buildTimeQuestion(mood: string | undefined, craving: string | undefined, dayPart: DayPart): QuizQuestion {
  if (dayPart === 'morning' || dayPart === 'lunch') {
    return {
      id: 'time',
      emoji: '⏰',
      question: 'How much time do you have right now?',
      outputKey: 'time',
      options: [
        { value: 'now', label: 'Grab & go', sub: '5-10 minutes', emoji: '⚡' },
        { value: 'quick', label: 'Quick sit-down', sub: '15-30 minutes', emoji: '🕐' },
        { value: 'cook', label: 'Full breakfast / lunch', sub: 'Cook or order a full meal', emoji: '👨‍🍳' },
        { value: 'occasion', label: 'Leisurely', sub: 'No rush, make it an event', emoji: '🎉' },
      ],
    };
  }

  if (craving === 'comfort' && mood === 'stressed') {
    return {
      id: 'time',
      emoji: '🚚',
      question: 'Comfort can\'t wait — how fast do you need it?',
      outputKey: 'time',
      options: [
        { value: 'now', label: 'Delivery ASAP', sub: 'Order now, eat soon', emoji: '⚡' },
        { value: 'quick', label: '30 minutes', sub: 'Quick cooking or pickup', emoji: '🕐' },
        { value: 'cook', label: 'Worth the effort', sub: 'Cook a proper meal', emoji: '👨‍🍳' },
        { value: 'occasion', label: 'Slow comfort', sub: 'Long dinner, no rush', emoji: '🎉' },
      ],
    };
  }

  return {
    id: 'time',
    emoji: '⏰',
    question: 'How much time do you have?',
    outputKey: 'time',
    options: [
      { value: 'now', label: 'Need it NOW', sub: 'Fast food / delivery', emoji: '⚡' },
      { value: 'quick', label: '30 minutes', sub: 'Quick cooking or pickup', emoji: '🕐' },
      { value: 'cook', label: 'Got time to cook', sub: '1+ hour recipes', emoji: '👨‍🍳' },
      { value: 'occasion', label: 'Special occasion', sub: 'Worth the wait', emoji: '🎉' },
    ],
  };
}

export function buildAllQuestions(): QuizQuestion[] {
  return buildDynamicQuestions({});
}

export function getTotalQuestions(): number {
  return 4;
}
