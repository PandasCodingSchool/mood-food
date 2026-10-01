// Decision games (v1 routes), with 2.0 icon + tile hue.
import type { IconName } from '@moodfood/ui';

export interface GameEntry {
  id: string;
  route: string;
  title: string;
  desc: string;
  time: string;
  tag?: string;
  icon: IconName;
  hue: number;
  comingSoon?: boolean;
}

export const GAMES: GameEntry[] = [
  { id: 'swipe-vibe', route: '/games/swipe-vibe', title: 'Snack Match', desc: 'Swipe food cards until your cravings click.', time: '1 min', tag: 'Popular', icon: 'swipe', hue: 40 },
  { id: 'wheel', route: '/games/wheel', title: 'Meal Roulette', desc: 'Spin for a meal vibe. Accept or roll again.', time: '30 sec', tag: 'Quick', icon: 'casino', hue: 350 },
  { id: 'character', route: '/games/character', title: "Tonight's Story", desc: "Three choices about how you're feeling.", time: '30 sec', icon: 'auto_stories', hue: 310 },
  { id: 'quiz', route: '/games/quiz', title: 'Mood Scoop', desc: 'Quick questions about cravings & budget.', time: '90 sec', icon: 'icecream', hue: 220 },
  { id: 'this-or-that', route: '/games/this-or-that', title: 'This or That', desc: 'Quick-fire duels until one wins.', time: '45 sec', tag: 'Quick', icon: 'compare_arrows', hue: 140 },
  { id: 'craving-radar', route: '/games/craving-radar', title: 'Craving Radar', desc: 'Tap the sensations pulling you.', time: '10 sec', icon: 'radar', hue: 270 },
  { id: 'story', route: '/games/story', title: 'Day Story', desc: "Live a mini workday; we'll read your mood.", time: '3 min', icon: 'history', hue: 200 },
  { id: 'bracket', route: '/games/bracket', title: 'Cravings Bracket', desc: 'Knockout rounds, one winner.', time: '1 min', tag: 'Seasonal', icon: 'account_tree', hue: 95 },
  { id: 'group', route: '/group', title: 'Group decide', desc: 'Everyone votes, one winner.', time: '2 min', tag: 'Social', icon: 'groups', hue: 180, comingSoon: true },
  { id: 'pantry', route: '/games/pantry', title: 'Pantry mode', desc: "Cook with what's already at home.", time: '20 sec', icon: 'kitchen', hue: 65, comingSoon: true },
];
