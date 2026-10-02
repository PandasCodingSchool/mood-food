import { oklch } from './color';
import {
  MOOD_SPECS,
  TIME_SPECS,
  type Gradient,
  type Mood,
  type TimeOfDay,
  type Weather,
} from './context';

/** Fixed colours that do not change with context. */
export const palette = {
  /** Text/icons placed on an accent fill. */
  onAccent: '#0B1422',
  /** Toasts, cart bar, "dark" buttons. */
  night: '#0B1422',
  white: '#FFFFFF',
  paper: '#FFFCF8',
  success: '#2BB673',
  rating: '#1E8E4E',
  veg: '#1E9E55',
  nonVeg: '#C8392E',
  swiggy: '#FC8019',
  danger: oklch(0.62, 0.19, 25),
  like: oklch(0.66, 0.2, 20),
  /** Bottom scrim on food photography. */
  scrim: 'rgba(8,8,14,0.88)',
  /** Glass controls laid over photos. */
  photoGlass: 'rgba(10,10,16,0.42)',
  photoGlassStrong: 'rgba(10,10,16,0.45)',
  photoBorder: 'rgba(255,255,255,0.18)',
  photoInk: '#FFFFFF',
  photoInk2: 'rgba(255,255,255,0.78)',
} as const;

export interface ThemeColors {
  /** Primary text. */
  ink: string;
  /** Secondary text. */
  ink2: string;
  /** Glass surface (cards, chips, round buttons). */
  surf: string;
  /** Stronger glass (raised cards, unread rows, swipe buttons). */
  surf2: string;
  /** Hairline borders and dividers. */
  line: string;
  /** Inactive track for bars, toggles, segments. */
  track: string;
  /** Subtle fill inside solid cards. */
  tint: string;
  /** Opaque card / sheet colour. */
  solid: string;
  /** Floating tab bar glass. */
  tab: string;
  /** Photo placeholder stripes. */
  ph1: string;
  ph2: string;
  /** Mood accent. */
  acc: string;
  /** Second accent stop for gradients. */
  acc2: string;
  /** Translucent accent wash. */
  accSoft: string;
  /** Accent tuned for text on the current background. */
  accText: string;
  onAcc: string;
}

export interface Theme {
  time: TimeOfDay;
  weather: Weather;
  mood: Mood;
  dark: boolean;
  colors: ThemeColors;
  backdrop: {
    gradient: Gradient;
    /** Extra wash laid over the gradient (dark rainy/cloudy). */
    overlay: Gradient | null;
    orbs: [string, string];
    orbOpacity: number;
  };
}

export interface ThemeInput {
  time: TimeOfDay;
  weather: Weather;
  mood: Mood;
}

/**
 * Resolves the living theme for a context. Mirrors `theme()` in the
 * MoodFood 2.0 design (docs/design/moodfood-2.0/project/MoodFoodApp.dc.html).
 */
export function createTheme({ time, weather, mood }: ThemeInput): Theme {
  const t = TIME_SPECS[time];
  const m = MOOD_SPECS[mood];
  const dark = t.dark || weather === 'stormy';

  let gradient = t.bg;
  let overlay: Gradient | null = null;
  let [orb1, orb2] = t.orbs;

  if (weather === 'stormy') {
    gradient = { angle: 170, colors: ['#0E1322', '#1F2740', '#352B4A'], locations: [0, 0.55, 1] };
    orb1 = '#5A4FB8';
    orb2 = '#2F6E9E';
  } else if (weather === 'rainy') {
    if (!dark) {
      gradient = { angle: 165, colors: ['#DCE4EE', '#C4D0DE', '#EFEAE3'], locations: [0, 0.48, 1] };
      orb2 = orb1;
      orb1 = '#8FB0D6';
    } else {
      overlay = { angle: 180, colors: ['rgba(38,60,96,0.5)', 'rgba(30,44,70,0.2)'], locations: [0, 1] };
    }
  } else if (weather === 'cloudy') {
    if (!dark) {
      gradient = { angle: 165, colors: ['#ECE8E3', '#D8D7DB', '#F3EEE8'], locations: [0, 0.5, 1] };
      orb2 = '#AEB6C4';
    } else {
      overlay = { angle: 180, colors: ['rgba(70,74,90,0.42)', 'rgba(40,42,55,0.2)'], locations: [0, 1] };
    }
  }

  const { hue: h, chroma: c } = m;
  const colors: ThemeColors = {
    ink: dark ? '#F7F2EC' : '#17130F',
    ink2: dark ? 'rgba(247,242,236,0.7)' : 'rgba(23,19,15,0.64)',
    surf: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)',
    surf2: dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.86)',
    line: dark ? 'rgba(255,255,255,0.12)' : 'rgba(23,19,15,0.08)',
    track: dark ? 'rgba(255,255,255,0.14)' : 'rgba(23,19,15,0.1)',
    tint: dark ? 'rgba(255,255,255,0.06)' : 'rgba(23,19,15,0.045)',
    solid: dark ? (weather === 'stormy' ? '#161B2B' : (t.solid ?? '#231726')) : palette.paper,
    tab: dark ? 'rgba(18,16,28,0.62)' : 'rgba(255,255,255,0.74)',
    ph1: dark ? 'rgba(255,255,255,0.07)' : 'rgba(23,19,15,0.06)',
    ph2: dark ? 'rgba(255,255,255,0.02)' : 'rgba(23,19,15,0.018)',
    acc: oklch(0.76, c, h),
    acc2: oklch(0.68, c, h + 28),
    accSoft: oklch(0.76, c, h, dark ? 0.2 : 0.24),
    accText: dark ? oklch(0.82, c, h) : oklch(0.5, c, h),
    onAcc: palette.onAccent,
  };

  return {
    time,
    weather,
    mood,
    dark,
    colors,
    backdrop: { gradient, overlay, orbs: [orb1, orb2], orbOpacity: dark ? 0.55 : 0.5 },
  };
}

/** Converts a CSS gradient angle to start/end points in a unit box (expo-linear-gradient). */
export function gradientPoints(angle: number): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  return { start: { x: 0.5 - dx, y: 0.5 - dy }, end: { x: 0.5 + dx, y: 0.5 + dy } };
}
