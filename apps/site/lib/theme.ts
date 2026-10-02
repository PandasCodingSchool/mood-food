import type { CSSProperties } from 'react';
import {
  createTheme,
  MOOD_SPECS,
  palette,
  shadow,
  TIME_SPECS,
  type Gradient,
  type Mood,
  type ThemeInput,
  type TimeOfDay,
} from '@moodfood/tokens';

// Bridges the app's living theme (@moodfood/tokens) to CSS custom properties,
// so the site and the app share one palette: time of day sets the backdrop,
// mood sets the accent.

export const DEFAULT_THEME: ThemeInput = { time: 'evening', weather: 'sunny', mood: 'happy' };

export const MOOD_OPTIONS = (Object.keys(MOOD_SPECS) as Mood[]).map((id) => ({ id, ...MOOD_SPECS[id] }));
export const TIME_OPTIONS = (Object.keys(TIME_SPECS) as TimeOfDay[]).map((id) => ({ id, ...TIME_SPECS[id] }));

/** CSS linear-gradient from a token gradient (RN angle convention: 180 = top → bottom). */
export const cssGradient = (g: Gradient) =>
  `linear-gradient(${g.angle}deg, ${g.colors.map((c, i) => `${c} ${Math.round(g.locations[i] * 100)}%`).join(', ')})`;

export function themeVars(input: ThemeInput): Record<string, string> {
  const t = createTheme(input);
  const c = t.colors;
  return {
    '--ink': c.ink,
    '--ink2': c.ink2,
    '--surf': c.surf,
    '--surf2': c.surf2,
    '--line': c.line,
    '--track': c.track,
    '--tint': c.tint,
    '--solid': c.solid,
    '--tab': c.tab,
    '--ph1': c.ph1,
    '--ph2': c.ph2,
    '--acc': c.acc,
    '--acc2': c.acc2,
    '--acc-soft': c.accSoft,
    '--acc-text': c.accText,
    '--on-acc': c.onAcc,
    '--backdrop': cssGradient(t.backdrop.gradient),
    '--backdrop-overlay': t.backdrop.overlay ? cssGradient(t.backdrop.overlay) : 'none',
    '--orb1': t.backdrop.orbs[0],
    '--orb2': t.backdrop.orbs[1],
    '--orb-opacity': String(t.backdrop.orbOpacity),
    '--glow': shadow.glow(c.acc),
    '--night': palette.night,
    '--scheme': t.dark ? 'dark' : 'light',
  };
}

export const themeStyle = (input: ThemeInput) => themeVars(input) as CSSProperties;
