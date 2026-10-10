import { Analytics } from '@vercel/analytics/next';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { ThemeRoot } from '@/components/ThemeRoot';
import { SITE_URL } from '@/lib/config';
import { body, display, iconFilled, iconOutlined, mono } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'MoodFood — food that matches your mood', template: '%s · MoodFood' },
  description:
    'MoodFood reads how you feel, the weather outside and the time of day, then picks what you will actually want to eat. Order it on Swiggy in one tap.',
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
      className={[display.variable, body.variable, mono.variable, iconOutlined.variable, iconFilled.variable].join(' ')}
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
