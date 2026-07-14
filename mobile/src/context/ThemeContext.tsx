import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';

const THEME_KEY = 'moodfood_dark_mode';

export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  border: string;
  text: string;
  subtext: string;
  navBg: string;
}

const lightTheme: Theme = {
  dark: false,
  bg: '#fff5eb',
  card: '#ffffff',
  border: 'rgba(0,0,0,0.06)',
  text: '#1a1a2e',
  subtext: '#64748b',
  navBg: '#ffffff',
};

const darkTheme: Theme = {
  dark: true,
  bg: '#0f172a',
  card: '#1e293b',
  border: 'rgba(255,255,255,0.08)',
  text: '#f1f5f9',
  subtext: '#94a3b8',
  navBg: '#1e293b',
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
  const [dark, setDark] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(THEME_KEY).then((val: string | null) => {
      if (val === 'true') setDark(true);
    });
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
