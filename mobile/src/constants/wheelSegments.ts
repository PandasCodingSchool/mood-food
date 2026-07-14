export interface WheelSegment {
  emoji: string;
  label: string;
  sub: string;
  mood: string;
  craving: string;
  budget: string;
}

/** Matches the design's exact 8 Meal Roulette segments, in wheel order. */
export const WHEEL_SEGMENTS: WheelSegment[] = [
  { emoji: '🍔', label: 'Comfort Food', sub: 'Warm, cozy, soul-soothing', mood: 'tired', craving: 'comfort', budget: 'medium' },
  { emoji: '🌶️', label: 'Spicy & Bold', sub: 'Turn up the heat', mood: 'adventurous', craving: 'spicy', budget: 'medium' },
  { emoji: '🥗', label: 'Fresh & Light', sub: 'Clean eating energy', mood: 'relaxed', craving: 'healthy', budget: 'medium' },
  { emoji: '🍰', label: 'Sweet Treats', sub: 'Dessert-first vibes', mood: 'happy', craving: 'sweet', budget: 'medium' },
  { emoji: '🌮', label: 'Street Food', sub: 'Casual, quick, delicious', mood: 'happy', craving: 'spicy', budget: 'low' },
  { emoji: '🍷', label: 'Fancy Night', sub: 'Treat yourself', mood: 'celebrating', craving: 'comfort', budget: 'high' },
  { emoji: '⚡', label: 'Quick Bite', sub: 'In and out, no fuss', mood: 'stressed', craving: 'comfort', budget: 'low' },
  { emoji: '🥑', label: 'Healthy Pick', sub: 'Feel-good fuel', mood: 'relaxed', craving: 'healthy', budget: 'medium' },
];
