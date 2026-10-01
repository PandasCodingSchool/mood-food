import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTheme } from '@moodfood/tokens';
import { ImageResponse } from 'next/og';
import { DEFAULT_THEME, cssGradient } from '@/lib/theme';

export const alt = 'MoodFood — food that matches your mood';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const theme = createTheme(DEFAULT_THEME);
  const logo = await readFile(join(process.cwd(), 'public/moodfood-logo.png'));
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: cssGradient(theme.backdrop.gradient),
          color: theme.colors.ink,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${logo.toString('base64')}`} width={120} height={120} style={{ borderRadius: 28 }} alt="" />
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1, marginTop: 40 }}>Food that matches your mood.</div>
        <div style={{ fontSize: 32, marginTop: 24, color: theme.colors.ink2 }}>Check in · play for 30 seconds · order on Swiggy</div>
        <div style={{ display: 'flex', marginTop: 40, height: 10, width: 220, borderRadius: 5, background: theme.colors.acc }} />
      </div>
    ),
    size,
  );
}
