'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { type Mood, type ThemeInput, type TimeOfDay } from '@moodfood/tokens';
import { DEFAULT_THEME, themeStyle } from '@/lib/theme';

interface LiveTheme extends ThemeInput {
  setMood: (m: Mood) => void;
  setTime: (t: TimeOfDay) => void;
}

const Ctx = createContext<LiveTheme | null>(null);
export const useLiveTheme = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLiveTheme outside ThemeRoot');
  return v;
};

/**
 * The site wears the app's living theme: a fixed evening/happy theme by default
 * (stable static HTML, no flash), and the hero's switcher re-themes the whole
 * page to any mood and time of day.
 */
export function ThemeRoot({ children }: { children: ReactNode }) {
  const [time, setTime] = useState<TimeOfDay>(DEFAULT_THEME.time);
  const [mood, setMood] = useState<Mood>(DEFAULT_THEME.mood);
  const weather = DEFAULT_THEME.weather;

  return (
    <Ctx.Provider value={{ time, weather, mood, setMood, setTime }}>
      <div className="theme-root" style={themeStyle({ time, weather, mood })}>
        <div className="ambient" aria-hidden>
          <div className="orb orb-a" />
          <div className="orb orb-b" />
        </div>
        {children}
      </div>
    </Ctx.Provider>
  );
}
