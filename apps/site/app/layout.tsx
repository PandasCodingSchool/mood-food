import { Analytics } from '@vercel/analytics/next';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { ThemeRoot } from '@/components/ThemeRoot';
import { SITE_URL } from '@/lib/config';
import { body, display, iconFilled, iconOutlined, kcBody, mono } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'MoodFood & KitchenCircle — order the mood, cook the week', template: '%s · MoodFood' },
  description:
    'Two ways to eat, one app. MoodFood picks tonight’s dish from your mood, the weather and the hour, and Swiggy delivers it. KitchenCircle plans the week’s home cooking with your family and your cook.',
  applicationName: 'MoodFood',
  openGraph: { type: 'website', siteName: 'MoodFood', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: '#1B1024',
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={[display.variable, body.variable, mono.variable, kcBody.variable, iconOutlined.variable, iconFilled.variable].join(' ')}
    >
      <body>
        <ThemeRoot>
          {children}
          <Footer />
        </ThemeRoot>
        {/* Vercel Web Analytics: cookieless page views, only reports on Vercel deployments. */}
        <Analytics />
      </body>
    </html>
  );
}
