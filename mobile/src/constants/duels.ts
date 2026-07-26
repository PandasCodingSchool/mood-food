import { Zap, Clock, Salad, Beef, Pizza, Flame, Bike, ChefHat, Crown, Wallet, Globe, Utensils } from 'lucide-react-native';
import type { DuelCard } from '../components/games/TwoCardDuel';

export interface DuelRound {
  prompt: string;
  dimensionA: string;
  dimensionB: string;
  a: DuelCard;
  b: DuelCard;
}

// Each round probes one trade-off dimension: price, health, speed,
// adventure, comfort. Feeds Bradley-Terry weights per context bucket.
export const DUEL_ROUNDS: DuelRound[] = [
  {
    prompt: 'Cheap & fast, or worth the wait?',
    dimensionA: 'price',
    dimensionB: 'comfort',
    a: { id: 'cheap_fast', label: 'Cheap & Fast', Icon: Zap, colors: ['#16a34a', '#4ade80'] },
    b: { id: 'worth_wait', label: 'Worth the Wait', Icon: Clock, colors: ['#7c3aed', '#a78bfa'] },
  },
  {
    prompt: 'Healthy bowl, or indulgent comfort food?',
    dimensionA: 'health',
    dimensionB: 'comfort',
    a: { id: 'healthy', label: 'Healthy Bowl', Icon: Salad, colors: ['#059669', '#34d399'] },
    b: { id: 'indulgent', label: 'Comfort Food', Icon: Beef, colors: ['#dc2626', '#f97316'] },
  },
  {
    prompt: 'Familiar favorite, or something new?',
    dimensionA: 'comfort',
    dimensionB: 'adventure',
    a: { id: 'familiar', label: 'Old Favorite', Icon: Pizza, colors: ['#f97316', '#fbbf24'] },
    b: { id: 'adventurous', label: 'Something New', Icon: Flame, colors: ['#be185d', '#ec4899'] },
  },
  {
    prompt: 'Delivered in 15 min, or the good stuff in 45?',
    dimensionA: 'speed',
    dimensionB: 'price',
    a: { id: 'fast', label: '15 Minutes', Icon: Bike, colors: ['#0891b2', '#22d3ee'] },
    b: { id: 'slow', label: 'Worth the Wait', Icon: ChefHat, colors: ['#92400e', '#d97706'] },
  },
  {
    prompt: 'Splurge tonight, or keep it light on the wallet?',
    dimensionA: 'comfort',
    dimensionB: 'price',
    a: { id: 'splurge', label: 'Splurge', Icon: Crown, colors: ['#1e1b4b', '#4338ca'] },
    b: { id: 'budget', label: 'Keep it Light', Icon: Wallet, colors: ['#166534', '#22c55e'] },
  },
  {
    prompt: 'Exotic cuisine, or a reliable classic?',
    dimensionA: 'adventure',
    dimensionB: 'comfort',
    a: { id: 'exotic', label: 'Exotic Pick', Icon: Globe, colors: ['#9333ea', '#c084fc'] },
    b: { id: 'classic', label: 'Reliable Classic', Icon: Utensils, colors: ['#b45309', '#f59e0b'] },
  },
];
