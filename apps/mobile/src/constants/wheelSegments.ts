import type { ComponentType } from 'react';
import { Beef, Flame, Salad, IceCream, Sandwich, Wine, Zap } from 'lucide-react-native';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

export interface WheelSegment {
  Icon: LucideIcon;
  label: string;
  sub: string;
  mood: string;
  craving: string;
  budget: string;
}

/** Matches the design's exact 8 Meal Roulette segments, in wheel order. */
export const WHEEL_SEGMENTS: WheelSegment[] = [
  { Icon: Beef, label: 'Comfort Food', sub: 'Warm, cozy, soul-soothing', mood: 'tired', craving: 'comfort', budget: 'medium' },
  { Icon: Flame, label: 'Spicy & Bold', sub: 'Turn up the heat', mood: 'adventurous', craving: 'spicy', budget: 'medium' },
  { Icon: Salad, label: 'Fresh & Light', sub: 'Clean eating energy', mood: 'relaxed', craving: 'healthy', budget: 'medium' },
  { Icon: IceCream, label: 'Sweet Treats', sub: 'Dessert-first vibes', mood: 'happy', craving: 'sweet', budget: 'medium' },
  { Icon: Sandwich, label: 'Street Food', sub: 'Casual, quick, delicious', mood: 'happy', craving: 'spicy', budget: 'low' },
  { Icon: Wine, label: 'Fancy Night', sub: 'Treat yourself', mood: 'celebrating', craving: 'comfort', budget: 'high' },
  { Icon: Zap, label: 'Quick Bite', sub: 'In and out, no fuss', mood: 'stressed', craving: 'comfort', budget: 'low' },
  { Icon: Salad, label: 'Healthy Pick', sub: 'Feel-good fuel', mood: 'relaxed', craving: 'healthy', budget: 'medium' },
];
