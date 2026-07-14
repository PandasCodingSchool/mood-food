export interface HistoryMeal {
  emoji: string;
  name: string;
  cuisine: string;
  price: string;
  via: string;
  date: string;
  saved: boolean;
  ordered: boolean;
  colors: readonly [string, string];
}

/** Demo history entries — History has no backend endpoint, matches the design's own hardcoded data. */
export const HISTORY_MEALS: HistoryMeal[] = [
  { emoji: '🍕', name: 'Truffle Margherita', cuisine: 'Italian', price: '$18', via: 'Character Match', date: 'Today', saved: true, ordered: true, colors: ['#dc2626', '#f97316'] },
  { emoji: '🍜', name: 'Spicy Miso Ramen', cuisine: 'Japanese', price: '$14', via: 'Mood Scoop', date: 'Yesterday', saved: true, ordered: false, colors: ['#9333ea', '#c084fc'] },
  { emoji: '🌮', name: 'Birria Tacos', cuisine: 'Mexican', price: '$12', via: 'Meal Roulette', date: '2 days ago', saved: false, ordered: true, colors: ['#b45309', '#f59e0b'] },
  { emoji: '🥗', name: 'Mediterranean Bowl', cuisine: 'Greek', price: '$16', via: 'Snack Match', date: '3 days ago', saved: true, ordered: false, colors: ['#0d9488', '#34d399'] },
  { emoji: '🍔', name: 'Double Smash Burger', cuisine: 'American', price: '$15', via: 'Day Story', date: '4 days ago', saved: false, ordered: true, colors: ['#92400e', '#d97706'] },
  { emoji: '🍣', name: 'Omakase Platter', cuisine: 'Japanese', price: '$28', via: 'Character Match', date: '5 days ago', saved: true, ordered: true, colors: ['#1e40af', '#60a5fa'] },
];
