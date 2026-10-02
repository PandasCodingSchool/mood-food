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
  { id: 'character', route: '/games/character', title: "Tonight's Story", desc: "Three choices about how you're feeling.", time: '30 sec', icon: 'history', hue: 200 },
  { id: 'quiz', route: '/games/quiz', title: 'Mood Scoop', desc: 'Three questions, one perfect bowl.', time: '30 sec', icon: 'icecream', hue: 220 },
  { id: 'this-or-that', route: '/games/this-or-that', title: 'This or That', desc: 'Rapid-fire pairs until one wins.', time: '45 sec', tag: 'Quick', icon: 'compare_arrows', hue: 140 },
  { id: 'craving-radar', route: '/games/craving-radar', title: 'Craving Radar', desc: "Tap what you're craving on a flavour map.", time: '10 sec', icon: 'radar', hue: 270 },
  { id: 'story', route: '/games/story', title: 'Story mode', desc: "Tell us your day, we'll plate it.", time: '1 min', tag: 'New', icon: 'auto_stories', hue: 310 },
  { id: 'bracket', route: '/games/bracket', title: 'Bracket', desc: 'Eight dishes, knockout rounds.', time: '1 min', icon: 'account_tree', hue: 95 },
  { id: 'group', route: '/group', title: 'Group decide', desc: 'Everyone votes, one winner.', time: '2 min', tag: 'Social', icon: 'groups', hue: 180, comingSoon: true },
  { id: 'pantry', route: '/games/pantry', title: 'Pantry mode', desc: "Cook with what's already at home.", time: '1 min', icon: 'kitchen', hue: 65 },
];
