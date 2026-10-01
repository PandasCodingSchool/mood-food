// The three context axes that drive the living theme:
//   time    → base gradient + light/dark
//   weather → backdrop overrides + ambient effects (rain, fog, sun glow, lightning)
//   mood    → accent hue (shared lightness/chroma so contrast holds)

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type Weather = 'rainy' | 'sunny' | 'cloudy' | 'stormy';
export type Mood = 'happy' | 'tired' | 'stressed' | 'adventurous';

export const TIMES_OF_DAY: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];
export const WEATHERS: Weather[] = ['rainy', 'sunny', 'cloudy', 'stormy'];
export const MOODS: Mood[] = ['happy', 'tired', 'stressed', 'adventurous'];

/** CSS-style linear gradient: angle in degrees (0 = to top, 90 = to right). */
export interface Gradient {
  angle: number;
  colors: string[];
  locations: number[];
}

export interface TimeSpec {
  label: string;
  icon: string;
  meal: string;
  dark: boolean;
  bg: Gradient;
  orbs: [string, string];
  /** Opaque card colour in dark themes. Light themes use the shared paper white. */
  solid?: string;
}

export const TIME_SPECS: Record<TimeOfDay, TimeSpec> = {
  morning: {
    label: 'Morning',
    icon: 'wb_sunny',
    meal: 'breakfast',
    dark: false,
    bg: { angle: 165, colors: ['#FFE6CC', '#FFD1AE', '#FFF4E8'], locations: [0, 0.4, 1] },
    orbs: ['#FFB45E', '#FF8FA3'],
  },
  afternoon: {
    label: 'Afternoon',
    icon: 'light_mode',
    meal: 'lunch',
    dark: false,
    bg: { angle: 165, colors: ['#FFF0D2', '#FFDDB0', '#D6F1E8'], locations: [0, 0.38, 1] },
    orbs: ['#FFBE45', '#4FC7B0'],
  },
  evening: {
    label: 'Evening',
    icon: 'wb_twilight',
    meal: 'dinner',
    dark: true,
    bg: { angle: 170, colors: ['#2A1732', '#5A2436', '#B0532A'], locations: [0, 0.48, 1] },
    orbs: ['#FF9A4D', '#8B3FA0'],
    solid: '#231726',
  },
  night: {
    label: 'Night',
    icon: 'dark_mode',
    meal: 'late-night',
    dark: true,
    bg: { angle: 170, colors: ['#070B1C', '#141638', '#2A1740'], locations: [0, 0.55, 1] },
    orbs: ['#4B3FA8', '#8A2E6E'],
    solid: '#13152B',
  },
};

export interface WeatherSpec {
  label: string;
  icon: string;
}

export const WEATHER_SPECS: Record<Weather, WeatherSpec> = {
  rainy: { label: 'Rainy', icon: 'rainy' },
  sunny: { label: 'Sunny', icon: 'sunny' },
  cloudy: { label: 'Cloudy', icon: 'cloud' },
  stormy: { label: 'Stormy', icon: 'thunderstorm' },
};

export interface MoodSpec {
  label: string;
  icon: string;
  /** OKLCH hue in degrees. */
  hue: number;
  /** OKLCH chroma. */
  chroma: number;
}

export const MOOD_SPECS: Record<Mood, MoodSpec> = {
  happy: { label: 'Happy', icon: 'sentiment_very_satisfied', hue: 55, chroma: 0.17 },
  tired: { label: 'Tired', icon: 'bedtime', hue: 72, chroma: 0.12 },
  stressed: { label: 'Stressed', icon: 'spa', hue: 165, chroma: 0.1 },
  adventurous: { label: 'Adventurous', icon: 'explore', hue: 355, chroma: 0.18 },
};

/** Clock hour (0-23) → time-of-day bucket. */
export function timeOfDayForHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}
