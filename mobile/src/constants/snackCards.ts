export interface SnackCard {
  emoji: string;
  name: string;
  desc: string;
  tags: string[];
  colors: readonly [string, string];
  craving: string;
}

/** Matches the design's exact 8 Snack Match cards. */
export const SNACK_CARDS: SnackCard[] = [
  { emoji: '🍕', name: 'Pepperoni Pizza', desc: 'Cheesy, greasy, perfect', tags: ['Comfort', 'Cheesy', 'Classic'], colors: ['#dc2626', '#f97316'], craving: 'comfort' },
  { emoji: '🥗', name: 'Poke Bowl', desc: 'Fresh fish, rice, all the toppings', tags: ['Healthy', 'Fresh', 'Light'], colors: ['#0d9488', '#34d399'], craving: 'healthy' },
  { emoji: '🌯', name: 'Loaded Burrito', desc: 'Stuffed to the max, no regrets', tags: ['Hearty', 'Spicy', 'Filling'], colors: ['#b45309', '#f59e0b'], craving: 'spicy' },
  { emoji: '🍣', name: 'Sushi Platter', desc: 'Elegant bites, clean flavors', tags: ['Fresh', 'Elegant', 'Light'], colors: ['#1e40af', '#60a5fa'], craving: 'healthy' },
  { emoji: '🍔', name: 'Smash Burger', desc: 'Crispy edges, juicy center', tags: ['Indulgent', 'Bold', 'Messy'], colors: ['#92400e', '#d97706'], craving: 'comfort' },
  { emoji: '🍜', name: 'Pad Thai', desc: 'Sweet, tangy, nutty noodles', tags: ['Savory', 'Tangy', 'Warm'], colors: ['#9333ea', '#c084fc'], craving: 'spicy' },
  { emoji: '🥞', name: 'Pancake Stack', desc: 'Breakfast for dinner? Always.', tags: ['Sweet', 'Fluffy', 'Comfort'], colors: ['#be185d', '#f472b6'], craving: 'sweet' },
  { emoji: '🍗', name: 'Fried Chicken', desc: 'Crispy, juicy, finger-licking', tags: ['Crunchy', 'Savory', 'Bold'], colors: ['#ea580c', '#fb923c'], craving: 'comfort' },
];
