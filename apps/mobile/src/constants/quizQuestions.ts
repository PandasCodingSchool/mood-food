import type { ComponentType } from 'react';
import { Smile, Utensils, Wallet, Clock, PartyPopper, Frown, Battery, Beef, Salad, Flame, IceCream, Crown, Banknote, Circle, ChefHat, Zap } from 'lucide-react-native';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

export interface QuizOption {
  value: string;
  label: string;
  sub: string;
  Icon: LucideIcon;
}

export interface QuizQuestion {
  Icon: LucideIcon;
  question: string;
  outputKey: 'mood' | 'craving' | 'budget' | 'time';
  options: QuizOption[];
}

/** Mood Scoop — 4 fixed questions (feeling, craving, budget, time), matches the design 1:1. */
export const MOOD_SCOOP_QUESTIONS: QuizQuestion[] = [
  {
    Icon: Smile,
    question: 'How are you feeling right now?',
    outputKey: 'mood',
    options: [
      { value: 'celebrating', label: 'On top of the world', sub: 'Celebratory vibes', Icon: PartyPopper },
      { value: 'relaxed', label: 'Chill & relaxed', sub: 'Low-key energy', Icon: Smile },
      { value: 'stressed', label: 'Stressed out', sub: 'Need comfort', Icon: Frown },
      { value: 'tired', label: 'Tired & lazy', sub: 'Zero effort meals', Icon: Battery },
    ],
  },
  {
    Icon: Utensils,
    question: 'What kind of craving is hitting?',
    outputKey: 'craving',
    options: [
      { value: 'comfort', label: 'Something hearty', sub: 'Big flavors, big portions', Icon: Beef },
      { value: 'healthy', label: 'Light & fresh', sub: 'Clean eating vibes', Icon: Salad },
      { value: 'spicy', label: 'Spicy & bold', sub: 'Bring the heat', Icon: Flame },
      { value: 'sweet', label: 'Sweet tooth', sub: 'Dessert-first energy', Icon: IceCream },
    ],
  },
  {
    Icon: Wallet,
    question: "What's your budget looking like?",
    outputKey: 'budget',
    options: [
      { value: 'high', label: "Ballin'", sub: '$30+ per meal', Icon: Crown },
      { value: 'medium', label: 'Moderate', sub: '$15-30 range', Icon: Banknote },
      { value: 'low', label: 'Budget-friendly', sub: 'Under $15', Icon: Circle },
      { value: 'low', label: 'Cook at home', sub: 'Grocery run ideas', Icon: ChefHat },
    ],
  },
  {
    Icon: Clock,
    question: 'How much time do you have?',
    outputKey: 'time',
    options: [
      { value: 'now', label: 'Need it NOW', sub: 'Fast food / delivery', Icon: Zap },
      { value: 'quick', label: '30 minutes', sub: 'Quick cooking or pickup', Icon: Clock },
      { value: 'cook', label: 'Got time to cook', sub: '1+ hour recipes', Icon: ChefHat },
      { value: 'occasion', label: 'Special occasion', sub: 'Worth the wait', Icon: PartyPopper },
    ],
  },
];

export const QUIZ_TOTAL_QUESTIONS = MOOD_SCOOP_QUESTIONS.length;
