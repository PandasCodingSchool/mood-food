import type { ReactNode } from 'react';
import { DEFAULT_THEME, themeStyle } from '@/lib/theme';

/** Applies the app's evening theme (lib/theme.ts) as CSS variables for the whole site. */
export function ThemeRoot({ children }: { children: ReactNode }) {
  return (
    <div className="theme-root" style={themeStyle(DEFAULT_THEME)}>
      {children}
    </div>
  );
}
