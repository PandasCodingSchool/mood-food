'use client';

import { MOOD_SPECS } from '@moodfood/tokens';
import { Icon } from '@/components/Icon';
import { useLiveTheme } from './ThemeRoot';

// A static rendering of the app's home screen, drawn with the same tokens.
// Picks per mood are illustrative examples, not live data.
const PICKS = {
  happy: { dish: 'Paneer Tikka Roll', meta: 'North Indian · 25 min · ₹220', why: 'Bright, smoky and easy to eat on the go.', match: 92 },
  tired: { dish: 'Dal Khichdi', meta: 'Comfort · 30 min · ₹180', why: 'Warm, soft and no effort. Bed by ten.', match: 94 },
  stressed: { dish: 'Curd Rice', meta: 'South Indian · 20 min · ₹160', why: 'Cool, calm and gentle on a long day.', match: 89 },
  adventurous: { dish: 'Khao Suey', meta: 'Burmese · 35 min · ₹340', why: 'Coconut, crunch and lime. Something new.', match: 87 },
} as const;

export function PhoneMock() {
  const { mood, time } = useLiveTheme();
  const pick = PICKS[mood];
  return (
    <div className="phone" aria-label={`MoodFood home screen, ${MOOD_SPECS[mood].label.toLowerCase()} mood`} role="img">
      <div className="phone-screen">
        <div className="phone-status">
          <span>9:41</span>
          <span className="phone-notch" />
          <Icon name="signal_cellular_alt" size={14} />
        </div>
        <p className="label phone-eyebrow">{`${MOOD_SPECS[mood].label} · ${time}`}</p>
        <p className="phone-title">Picked for right now</p>
        <div className="phone-hero">
          <div className="stripes" />
          <span className="match">
            <Icon name="auto_awesome" size={13} /> {pick.match}% match
          </span>
          <div className="phone-hero-copy">
            <p className="phone-dish">{pick.dish}</p>
            <p className="phone-meta">{pick.meta}</p>
            <p className="phone-why">{pick.why}</p>
            <div className="phone-actions">
              <span className="pill pill-acc">Order now</span>
              <span className="pill pill-glass">See why</span>
            </div>
          </div>
        </div>
        <div className="phone-chips">
          <span className="pill pill-glass"><Icon name="swipe" size={14} /> Snack Match</span>
          <span className="pill pill-glass"><Icon name="casino" size={14} /> Roulette</span>
        </div>
        <div className="phone-tab">
          <Icon name="home" size={18} />
          <Icon name="auto_awesome" size={18} />
          <span className="phone-fab"><Icon name="mood" size={20} /></span>
          <Icon name="stadia_controller" size={18} />
          <Icon name="person" size={18} />
        </div>
      </div>
    </div>
  );
}
