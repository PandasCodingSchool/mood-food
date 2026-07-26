import type { ComponentType } from 'react';
import { Sunrise, Sun, Coffee, Moon, Sparkles, PartyPopper, Smile, Frown, Battery, Wheat, Egg, Salad, Flame, Soup, Pizza, IceCream, Apple, Beef, Wallet, Circle, Banknote, Crown, ChefHat, Clock, Truck, Zap, Cookie, Cake, Utensils } from 'lucide-react-native';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

export type DayPart = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'late-night';
export type QuizOutputKey = 'mood' | 'craving' | 'budget' | 'time';

export interface QuizOption {
  value: string;
  label: string;
  sub: string;
  Icon: LucideIcon;
}

export interface QuizQuestion {
  id: string;
  Icon: LucideIcon;
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

function getDayPartIcon(dayPart: DayPart): LucideIcon {
  switch (dayPart) {
    case 'morning': return Sunrise;
    case 'lunch': return Sun;
    case 'afternoon': return Coffee;
    case 'evening': return Moon;
    case 'late-night': return Sparkles;
  }
}

export function buildDynamicQuestions(answers: Record<string, string>): QuizQuestion[] {
  const dayPart = getDayPart();
  const questions: QuizQuestion[] = [];

  // 1. Time-aware greeting + mood
  questions.push({
    id: 'mood',
    Icon: getDayPartIcon(dayPart),
    question: `${getDayPartGreeting(dayPart)} — how are you feeling right now?`,
    outputKey: 'mood',
    options: [
      { value: 'celebrating', label: 'On top of the world', sub: 'Celebratory vibes', Icon: PartyPopper },
      { value: 'relaxed', label: 'Chill & relaxed', sub: 'Low-key energy', Icon: Smile },
      { value: 'stressed', label: 'Stressed out', sub: 'Need comfort', Icon: Frown },
      { value: 'tired', label: 'Tired & lazy', sub: 'Zero effort meals', Icon: Battery },
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
      Icon: Wheat,
      question: 'What sounds good this morning?',
      outputKey: 'craving',
      options: [
        { value: 'sweet', label: 'Sweet breakfast', sub: 'Pancakes, pastries, fruit', Icon: Wheat },
        { value: 'comfort', label: 'Hearty & savory', sub: 'Eggs, toast, breakfast bowls', Icon: Egg },
        { value: 'healthy', label: 'Light & fresh', sub: 'Smoothies, yogurt, oats', Icon: Salad },
        { value: 'spicy', label: 'Bold flavors', sub: 'Spicy omelets, wraps, chai', Icon: Flame },
      ],
    };
  }

  if (dayPart === 'late-night') {
    return {
      id: 'craving',
      Icon: Soup,
      question: 'It\'s late — what kind of bite are you after?',
      outputKey: 'craving',
      options: [
        { value: 'comfort', label: 'Late-night comfort', sub: 'Pizza, burgers, fries', Icon: Pizza },
        { value: 'spicy', label: 'Spicy kick', sub: 'Ramen, noodles, street food', Icon: Flame },
        { value: 'sweet', label: 'Midnight sweet', sub: 'Ice cream, cookies, shakes', Icon: IceCream },
        { value: 'healthy', label: 'Light snack', sub: 'Nuts, fruit, yogurt', Icon: Apple },
      ],
    };
  }

  if (mood === 'stressed') {
    return {
      id: 'craving',
      Icon: Beef,
      question: 'Comfort incoming — what are you craving?',
      outputKey: 'craving',
      options: [
        { value: 'comfort', label: 'Something hearty', sub: 'Big flavors, big portions', Icon: Beef },
        { value: 'spicy', label: 'Spicy & bold', sub: 'Bring the heat', Icon: Flame },
        { value: 'sweet', label: 'Sweet tooth', sub: 'Dessert-first energy', Icon: IceCream },
        { value: 'healthy', label: 'Surprisingly clean', sub: 'Healthy comfort food', Icon: Salad },
      ],
    };
  }

  return {
    id: 'craving',
    Icon: Utensils,
    question: 'What kind of craving is hitting?',
    outputKey: 'craving',
    options: [
      { value: 'comfort', label: 'Something hearty', sub: 'Big flavors, big portions', Icon: Beef },
      { value: 'healthy', label: 'Light & fresh', sub: 'Clean eating vibes', Icon: Salad },
      { value: 'spicy', label: 'Spicy & bold', sub: 'Bring the heat', Icon: Flame },
      { value: 'sweet', label: 'Sweet tooth', sub: 'Dessert-first energy', Icon: IceCream },
    ],
  };
}

function buildBudgetQuestion(mood: string | undefined, craving: string | undefined, dayPart: DayPart): QuizQuestion {
  if (mood === 'tired' || dayPart === 'late-night') {
    return {
      id: 'budget',
      Icon: Wallet,
      question: 'Budget check — what works tonight?',
      outputKey: 'budget',
      options: [
        { value: 'low', label: 'Cheap & quick', sub: 'Under $10, ready fast', Icon: Circle },
        { value: 'medium', label: 'Reasonable', sub: '$10-20 range', Icon: Banknote },
        { value: 'high', label: 'Worth it', sub: 'Treat yourself', Icon: Crown },
      ],
    };
  }

  if (craving === 'sweet') {
    return {
      id: 'budget',
      Icon: Crown,
      question: 'How fancy is your sweet treat?',
      outputKey: 'budget',
      options: [
        { value: 'low', label: 'Quick sugar fix', sub: 'Candy, cookies, local bakery', Icon: Cookie },
        { value: 'medium', label: 'Nice dessert', sub: 'Premium ice cream or pastries', Icon: IceCream },
        { value: 'high', label: 'Full indulgence', sub: 'Artisan desserts, tasting menu', Icon: Cake },
      ],
    };
  }

  return {
    id: 'budget',
    Icon: Wallet,
    question: "What's your budget looking like?",
    outputKey: 'budget',
    options: [
      { value: 'high', label: "Ballin'", sub: '$30+ per meal', Icon: Crown },
      { value: 'medium', label: 'Moderate', sub: '$15-30 range', Icon: Banknote },
      { value: 'low', label: 'Budget-friendly', sub: 'Under $15', Icon: Circle },
      { value: 'low', label: 'Cook at home', sub: 'Grocery run ideas', Icon: ChefHat },
    ],
  };
}

function buildTimeQuestion(mood: string | undefined, craving: string | undefined, dayPart: DayPart): QuizQuestion {
  if (dayPart === 'morning' || dayPart === 'lunch') {
    return {
      id: 'time',
      Icon: Clock,
      question: 'How much time do you have right now?',
      outputKey: 'time',
      options: [
        { value: 'now', label: 'Grab & go', sub: '5-10 minutes', Icon: Zap },
        { value: 'quick', label: 'Quick sit-down', sub: '15-30 minutes', Icon: Clock },
        { value: 'cook', label: 'Full breakfast / lunch', sub: 'Cook or order a full meal', Icon: ChefHat },
        { value: 'occasion', label: 'Leisurely', sub: 'No rush, make it an event', Icon: PartyPopper },
      ],
    };
  }

  if (craving === 'comfort' && mood === 'stressed') {
    return {
      id: 'time',
      Icon: Truck,
      question: 'Comfort can\'t wait — how fast do you need it?',
      outputKey: 'time',
      options: [
        { value: 'now', label: 'Delivery ASAP', sub: 'Order now, eat soon', Icon: Zap },
        { value: 'quick', label: '30 minutes', sub: 'Quick cooking or pickup', Icon: Clock },
        { value: 'cook', label: 'Worth the effort', sub: 'Cook a proper meal', Icon: ChefHat },
        { value: 'occasion', label: 'Slow comfort', sub: 'Long dinner, no rush', Icon: PartyPopper },
      ],
    };
  }

  return {
    id: 'time',
    Icon: Clock,
    question: 'How much time do you have?',
    outputKey: 'time',
    options: [
      { value: 'now', label: 'Need it NOW', sub: 'Fast food / delivery', Icon: Zap },
      { value: 'quick', label: '30 minutes', sub: 'Quick cooking or pickup', Icon: Clock },
      { value: 'cook', label: 'Got time to cook', sub: '1+ hour recipes', Icon: ChefHat },
      { value: 'occasion', label: 'Special occasion', sub: 'Worth the wait', Icon: PartyPopper },
    ],
  };
}

export function buildAllQuestions(): QuizQuestion[] {
  return buildDynamicQuestions({});
}

export function getTotalQuestions(): number {
  return 4;
}
