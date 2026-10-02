import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTheme, type Mood, type Theme, type TimeOfDay, type Weather } from '@moodfood/tokens';

const ThemeContext = createContext<Theme | null>(null);

export interface MoodThemeProviderProps {
  time: TimeOfDay;
  weather: Weather;
  mood: Mood;
  children: ReactNode;
}

/**
 * Provides the living theme. The app decides where time/weather/mood come
 * from (clock, weather API, today's check-in); the kit only renders them.
 */
export function MoodThemeProvider({ time, weather, mood, children }: MoodThemeProviderProps) {
  const theme = useMemo(() => createTheme({ time, weather, mood }), [time, weather, mood]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <MoodThemeProvider>');
  return theme;
}
