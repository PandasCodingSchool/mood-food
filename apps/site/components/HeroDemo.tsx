'use client';

import type { Mood } from '@moodfood/tokens';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { PhoneMock } from '@/components/PhoneMock';
import { MOOD_OPTIONS } from '@/lib/theme';

const ORDER: Mood[] = ['tired', 'happy', 'stressed', 'adventurous'];

/** Hero phone that cycles through moods until the visitor picks one. */
export function HeroDemo() {
  const [mood, setMood] = useState<Mood>('tired');
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setMood((m) => ORDER[(ORDER.indexOf(m) + 1) % ORDER.length]), 4200);
    return () => clearInterval(id);
  }, [auto]);

  return (
    <div className="hero-demo">
      <div className="hero-stage">
        <div className="float">
          <PhoneMock mood={mood} />
        </div>
        <div className="toast toast-a" aria-hidden>
          <span className="toast-icon">
            <Icon name="auto_awesome" size={19} />
          </span>
          Tired + rainy → Masala khichdi, 96% match
        </div>
        <div className="toast toast-b" aria-hidden>
          <span className="toast-icon">
            <Icon name="two_wheeler" size={19} />
          </span>
          Your order is 4 min away · rain-proof packing
        </div>
      </div>
      <div className="mood-picker">
        <span className="eyebrow">{auto ? 'Auto-playing · tap a mood to take over' : 'Try it · how are you feeling?'}</span>
        <div className="mood-chips" role="radiogroup" aria-label="Mood">
          {ORDER.map((id) => {
            const m = MOOD_OPTIONS.find((o) => o.id === id)!;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={mood === id}
                className="chip"
                onClick={() => {
                  setAuto(false);
                  setMood(id);
                }}
              >
                <span className="chip-dot" style={{ background: m.dot }} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
