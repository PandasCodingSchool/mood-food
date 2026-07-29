import { colors } from './theme';
import type { ComponentType } from 'react';
import {
  Bot,
  Brain,
  Dices,
  Flame,
  Gamepad2,
  Hand,
  Heart,
  Leaf,
  Lightbulb,
  PartyPopper,
  Pizza,
  RefreshCw,
  Salad,
  ShoppingCart,
  Sparkles,
  Star,
  Target,
  Theater,
  Utensils,
  Wallet,
  Zap,
} from 'lucide-react-native';

export type OnboardIcon = ComponentType<{ size?: number; color?: string }>;

export interface OnboardFeature {
  Icon: OnboardIcon;
  text: string;
}

export interface OnboardStep {
  mainIcon: OnboardIcon;
  orbit: [OnboardIcon, OnboardIcon, OnboardIcon, OnboardIcon];
  tag: string;
  title: string;
  desc: string;
  accent: string;
  btnColors: readonly [string, string];
  features: OnboardFeature[] | null;
}

/** Matches the design's exact 4 onboarding steps. */
export const ONBOARD_STEPS: OnboardStep[] = [
  {
    mainIcon: Gamepad2,
    orbit: [Pizza, Dices, Sparkles, Sparkles],
    tag: 'Step 1',
    title: 'Play a game, discover your craving',
    desc: 'Five fun mini-games read your mood and figure out exactly what you want to eat tonight.',
    accent: '#7c3aed',
    btnColors: ['#7c3aed', '#a78bfa'],
    features: [
      { Icon: Theater, text: 'Character Match — which TV character eats like you?' },
      { Icon: Dices, text: 'Meal Roulette — spin & let fate decide' },
      { Icon: Hand, text: 'Snack Match — swipe your way to dinner' },
    ],
  },
  {
    mainIcon: Bot,
    orbit: [Zap, Brain, Lightbulb, Target],
    tag: 'Step 2',
    title: 'AI picks your perfect meal',
    desc: 'Our AI reads your vibe and matches it to 3 curated meals — tuned to your budget, diet, and mood.',
    accent: '#0891b2',
    btnColors: ['#0891b2', '#22d3ee'],
    features: null,
  },
  {
    mainIcon: RefreshCw,
    orbit: [Heart, Wallet, Salad, ShoppingCart],
    tag: 'Step 3',
    title: 'Swap, save & order instantly',
    desc: 'Every pick comes with a healthier swap and a budget-friendly alternative. Tap to order.',
    accent: '#16a34a',
    btnColors: ['#16a34a', '#4ade80'],
    features: [
      { Icon: Leaf, text: 'Healthier swap — same vibe, lighter choice' },
      { Icon: Wallet, text: 'Budget pick — delicious for less' },
      { Icon: ShoppingCart, text: 'One-tap ordering via your fav delivery app' },
    ],
  },
  {
    mainIcon: Utensils,
    orbit: [Flame, Sparkles, PartyPopper, Star],
    tag: 'Ready',
    title: 'From hungry to eating in 90 seconds',
    desc: 'No more scrolling menus. Just play, pick, and eat.',
    accent: '#f97316',
    btnColors: [colors.orange, colors.orange],
    features: null,
  },
];
