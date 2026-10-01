import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';

// The app's type system (packages/tokens/src/typography.ts): Bricolage
// Grotesque display, Geist UI text, Geist Mono eyebrow labels.
export const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-display' });
export const body = Geist({ subsets: ['latin'], variable: '--font-body' });
export const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

// Material Symbols subset shared with the app.
export const iconOutlined = localFont({
  src: '../../../packages/ui/assets/fonts/MaterialSymbolsRounded-Outlined.ttf',
  variable: '--font-icon',
  display: 'block',
  preload: true,
});
export const iconFilled = localFont({
  src: '../../../packages/ui/assets/fonts/MaterialSymbolsRounded-Filled.ttf',
  variable: '--font-icon-filled',
  display: 'block',
  preload: false,
});
