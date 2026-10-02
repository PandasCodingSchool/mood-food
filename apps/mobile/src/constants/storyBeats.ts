import type { ComponentType } from 'react';
import { AlarmClock, Moon, Dumbbell, Smartphone, Coffee, Egg, Pizza, Laptop, Users, Truck, Clock, Battery, IceCream, Footprints, Home, PartyPopper, Smile, Soup, Zap, Compass, Flame, Salad, Heart, Beef, Sparkles } from 'lucide-react-native';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

export interface DayChoice {
  Icon: LucideIcon;
  label: string;
}

export interface DayScene {
  time: string;
  location: string;
  Icon: LucideIcon;
  colors: readonly [string, string, ...string[]];
  locations?: readonly [number, number, ...number[]];
  narrative: string;
  subtext: string;
  choices: DayChoice[];
}

export interface DayMoodTag {
  Icon: LucideIcon;
  label: string;
}

export interface DayMood {
  Icon: LucideIcon;
  label: string;
  desc: string;
  tags: DayMoodTag[];
  mood: string;
  craving: string;
  budget: string;
  preference: string;
}

/** Matches the design's exact 5 scenes, one per moment of the day. */
export const DAY_SCENES: DayScene[] = [
  {
    time: '7:15 AM',
    location: 'Bedroom',
    Icon: AlarmClock,
    colors: ['#1e3a5f', '#f59e0b'],
    narrative: "Your alarm goes off. The sun's barely up.",
    subtext: 'How do you start this day?',
    choices: [
      { Icon: Moon, label: 'Snooze 3 more times... okay maybe 4' },
      { Icon: Dumbbell, label: 'Up and at it — morning run!' },
      { Icon: Smartphone, label: 'Scroll phone for 20 min first' },
    ],
  },
  {
    time: '8:30 AM',
    location: 'Kitchen',
    Icon: Coffee,
    colors: ['#92400e', '#fbbf24'],
    narrative: "You stumble to the kitchen. What's breakfast?",
    subtext: "Choose wisely... or don't.",
    choices: [
      { Icon: Egg, label: 'Proper breakfast — eggs, toast, the works' },
      { Icon: Coffee, label: 'Just coffee. Coffee IS breakfast.' },
      { Icon: Pizza, label: "Leftover pizza? Don't judge me." },
    ],
  },
  {
    time: '12:30 PM',
    location: 'Work / Desk',
    Icon: Laptop,
    colors: ['#1e40af', '#60a5fa'],
    narrative: "It's lunchtime. Your coworker wants to try a new place.",
    subtext: "But you're in the middle of something...",
    choices: [
      { Icon: Users, label: "Let's go! I need a break anyway" },
      { Icon: Truck, label: "Order delivery — I'm in the zone" },
      { Icon: Clock, label: 'I forgot to eat... is it 12:30 already?' },
    ],
  },
  {
    time: '3:45 PM',
    location: 'Break Room',
    Icon: Battery,
    colors: ['#6d28d9', '#a78bfa'],
    narrative: 'The afternoon slump hits HARD. You need fuel.',
    subtext: 'Your energy is fading fast.',
    choices: [
      { Icon: IceCream, label: 'Vending machine raid — chocolate saves' },
      { Icon: Coffee, label: 'Green tea & a handful of nuts' },
      { Icon: Footprints, label: 'Walk it off, no snack needed' },
    ],
  },
  {
    time: '6:30 PM',
    location: 'Home',
    Icon: Home,
    colors: ['#7c2d12', '#f97316', '#fbbf24'],
    locations: [0, 0.6, 1],
    narrative: "You're finally home. The day is done.",
    subtext: 'How are you feeling right now?',
    choices: [
      { Icon: Moon, label: 'Exhausted — comfort food and chill' },
      { Icon: PartyPopper, label: "Wired — let's go OUT tonight" },
      { Icon: Smile, label: 'Peaceful — something light and easy' },
    ],
  },
];

/** Index order matters — matched by the scorer in storyEngine.ts (0=comfort,1=social,2=balanced,3=chaotic). */
export const DAY_MOODS: DayMood[] = [
  {
    Icon: Moon,
    label: 'Cozy & Drained',
    desc: 'You had a long one. Your body wants warmth, comfort, and zero decision-making. Let us handle dinner.',
    tags: [
      { Icon: Battery, label: 'Low energy' },
      { Icon: Home, label: 'Comfort zone' },
      { Icon: Soup, label: 'Warm foods' },
    ],
    mood: 'tired',
    craving: 'comfort',
    budget: 'medium',
    preference: 'both',
  },
  {
    Icon: Zap,
    label: 'Hyped & Social',
    desc: "You're buzzing! Today gave you energy and you want to keep the momentum going with bold, fun food.",
    tags: [
      { Icon: Flame, label: 'High energy' },
      { Icon: Compass, label: 'Adventurous' },
      { Icon: Flame, label: 'Bold flavors' },
    ],
    mood: 'celebrating',
    craving: 'spicy',
    budget: 'medium',
    preference: 'both',
  },
  {
    Icon: Smile,
    label: 'Balanced & Mindful',
    desc: 'You navigated the day with intention. You want something nourishing that matches your centered state.',
    tags: [
      { Icon: Sparkles, label: 'Centered' },
      { Icon: Salad, label: 'Clean eats' },
      { Icon: Heart, label: 'Feel-good' },
    ],
    mood: 'relaxed',
    craving: 'healthy',
    budget: 'medium',
    preference: 'both',
  },
  {
    Icon: Zap,
    label: 'Chaotic & Hungry',
    desc: "What a wild ride. You forgot to eat, made impulsive choices, and now you're STARVING. Feed the chaos.",
    tags: [
      { Icon: Zap, label: 'Chaotic' },
      { Icon: Flame, label: 'No rules' },
      { Icon: Beef, label: 'MAX portions' },
    ],
    mood: 'adventurous',
    craving: 'comfort',
    budget: 'medium',
    preference: 'both',
  },
];
