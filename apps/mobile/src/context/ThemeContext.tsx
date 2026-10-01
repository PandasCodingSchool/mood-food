import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const THEME_KEY = 'moodfood_dark_mode';

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  card: string;
  input: string;
  border: string;
  text: string;
  subtext: string;
  muted: string;
  navBg: string;
  shadow: string;
  overlay: string;
}

const lightTheme: Theme = {
  dark: false,
  bg: '#ffffff',
  surface: '#f8fafc',
  card: '#ffffff',
  input: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  text: '#0f172a',
  subtext: '#64748b',
  muted: '#94a3b8',
  navBg: '#ffffff',
  shadow: 'rgba(0,0,0,0.08)',
  overlay: 'rgba(0,0,0,0.04)',
};

const darkTheme: Theme = {
  dark: true,
  bg: '#0b1021',
  surface: '#151b2e',
  card: '#1e293b',
  input: '#1e293b',
  border: 'rgba(255,255,255,0.08)',
  text: '#f8fafc',
  subtext: '#94a3b8',
  muted: '#64748b',
  navBg: '#0f172a',
  shadow: 'rgba(0,0,0,0.3)',
  overlay: 'rgba(255,255,255,0.04)',
};

interface ThemeContextValue {
  theme: Theme;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  toggleDark: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(Appearance.getColorScheme() === 'dark');

  useEffect(() => {
    SecureStore.getItemAsync(THEME_KEY).then((val: string | null) => {
      if (val === 'true') setDark(true);
      if (val === 'false') setDark(false);
    });
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme) {
        SecureStore.getItemAsync(THEME_KEY).then((val) => {
          if (!val) setDark(colorScheme === 'dark');
        });
      }
    });
    return () => sub.remove();
  }, []);

  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      SecureStore.setItemAsync(THEME_KEY, String(next));
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme: dark ? darkTheme : lightTheme, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
