import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'MoodFood and KitchenCircle: order the mood tonight, cook together this week';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Two equal halves, like the home hero: MoodFood night on the left, KitchenCircle day on the right.
export default async function Image() {
  const [mf, kc] = await Promise.all([
    readFile(join(process.cwd(), 'public/moodfood-logo-dark.png')),
    readFile(join(process.cwd(), 'public/kitchen-circle-mark.png')),
  ]);
  const half = { width: 600, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 64 } as const;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
        <div style={{ ...half, background: '#140B18', color: '#F6F1EA' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${mf.toString('base64')}`} width={130} height={127} alt="" />
          <div style={{ fontSize: 22, letterSpacing: 3, color: '#F0B64A', marginTop: 36 }}>MOODFOOD · TONIGHT</div>
          <div style={{ fontSize: 60, fontWeight: 800, letterSpacing: -2, lineHeight: 1.02, marginTop: 14 }}>Tell us how you feel. We’ll order the mood.</div>
        </div>
        <div style={{ ...half, background: '#F7F3EA', color: '#1C2620' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${kc.toString('base64')}`} width={110} height={110} alt="" style={{ borderRadius: 55 }} />
          <div style={{ fontSize: 22, letterSpacing: 3, color: '#1F4A36', marginTop: 46 }}>KITCHENCIRCLE · THIS WEEK</div>
          <div style={{ fontSize: 60, fontWeight: 800, letterSpacing: -2, lineHeight: 1.02, marginTop: 14 }}>One meal. Everyone in.</div>
        </div>
        <div style={{ position: 'absolute', left: 598, top: 60, bottom: 60, width: 4, background: '#E8A317', display: 'flex' }} />
      </div>
    ),
    size,
  );
}
