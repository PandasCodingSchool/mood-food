import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { Nav } from '@/components/Nav';
import { ThemeRoot } from '@/components/ThemeRoot';
import { SITE_URL } from '@/lib/config';
import { body, display, iconFilled, iconOutlined, mono } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'MoodFood — food that matches your mood', template: '%s · MoodFood' },
  description:
    'Tell MoodFood how you feel, play a 30-second game, and get three dishes picked for your mood, the time and the weather. Order them on Swiggy without leaving the app.',
  applicationName: 'MoodFood',
  openGraph: { type: 'website', siteName: 'MoodFood', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: '#2A1732',
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={[display.variable, body.variable, mono.variable, iconOutlined.variable, iconFilled.variable].join(' ')}
    >
      <body>
        <ThemeRoot>
          <Nav />
          <main>{children}</main>
          <Footer />
        </ThemeRoot>
      </body>
    </html>
  );
}
