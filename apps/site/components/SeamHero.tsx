'use client';

import type { Mood } from '@moodfood/tokens';
import Image from 'next/image';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { LiveClock } from '@/components/LiveClock';
import { PHONE_PICKS } from '@/lib/content';
import { KC_DAYS, KC_TODAY, MOOD_ORDER } from '@/lib/home';
import { MOOD_OPTIONS } from '@/lib/theme';

const MIN = 12;
const MAX = 88;
const TONIGHT = 76;
const THIS_WEEK = 24;

/**
 * The home hero: MoodFood (tonight) and KitchenCircle (this week) as two full
 * layers split by a draggable seam. It opens at an even 50/50 so neither
 * product leads. On phones the seam becomes a two-way switch.
 */
export function SeamHero() {
  const [seam, setSeam] = useState(50);
  const [mood, setMood] = useState<Mood>('tired');

  const isTonight = seam >= 60;
  const isWeek = seam <= 40;
  const side = seam >= 50 ? 'mf' : 'kc';
  const pick = PHONE_PICKS[mood];
  const today = KC_DAYS[KC_TODAY];

  return (
    <section className="seam" data-side={side} aria-label="Two ways to eat: MoodFood tonight, KitchenCircle this week">
      <div className="seam-switch" role="group" aria-label="Choose how you eat">
        <button type="button" aria-pressed={side === 'mf'} className="seam-tab seam-tab-mf" onClick={() => setSeam(TONIGHT)}>
          Tonight · MoodFood
        </button>
        <button type="button" aria-pressed={side === 'kc'} className="seam-tab seam-tab-kc" onClick={() => setSeam(THIS_WEEK)}>
          This week · KitchenCircle
        </button>
      </div>

      <div className="seam-stack">
        {/* Layer 1: MoodFood, tonight */}
        <div className="seam-layer seam-mf">
          <Image src="/food/biryani.jpg" alt="" fill priority sizes="100vw" className="seam-photo" />
          <div className="seam-mf-veil" aria-hidden />
          <div className="seam-grid">
            <div className="seam-copy">
              <p className="seam-kicker seam-kicker-mf">
                MoodFood · tonight · <LiveClock />
              </p>
              <h1 className="seam-h">Tell us how you feel. We&rsquo;ll order the mood.</h1>
              <p className="seam-lede">
                Four taps on how you feel. MoodFood blends it with the weather and the hour, picks the dish, and Swiggy
                brings it over.
              </p>
              <div className="mood-row" role="group" aria-label="Mood">
                {MOOD_ORDER.map((id) => {
                  const m = MOOD_OPTIONS.find((o) => o.id === id)!;
                  return (
                    <button key={id} type="button" aria-pressed={mood === id} className="mood-chip" onClick={() => setMood(id)}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div className="seam-cta">
                <a className="pill-btn pill-mf" href="#moodfood">
                  Find tonight&rsquo;s dish <Icon name="arrow_forward" size={18} />
                </a>
                <span className="seam-note">
                  Picked: <strong>{pick.dish}</strong> · {pick.match}% match
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Layer 2: KitchenCircle, this week (revealed right of the seam) */}
        <div className="seam-layer seam-kc" style={{ clipPath: `inset(0 0 0 ${seam}%)` }}>
          <div className="seam-kc-ring" aria-hidden />
          <div className="seam-kc-dot" aria-hidden />
          <div className="seam-grid">
            <div className="seam-spacer" />
            <div className="seam-copy seam-copy-kc">
              <p className="seam-kicker seam-kicker-kc">KitchenCircle · this week</p>
              <h2 className="seam-h">One meal. Everyone in.</h2>
              <p className="seam-lede">
                Plan the week with your family and your cook. One grocery list, the menu in your cook&rsquo;s language,
                and Haldi to change it in a sentence.
              </p>
              <ol className="kc-rings seam-rings" aria-label="This week at a glance">
                {KC_DAYS.map((d) => (
                  <li key={d.day} className={`kc-ring kc-ring-${d.state}`} aria-label={`${d.day}: ${d.meal}`}>
                    {d.day}
                  </li>
                ))}
              </ol>
              <div className="seam-cta">
                <a className="pill-btn pill-kc" href="#kitchencircle">
                  Plan this week together <Icon name="arrow_forward" size={18} />
                </a>
                <span className="seam-note">
                  Today: <strong>{today.meal}</strong> · {today.note}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="seam-line" style={{ left: `${seam}%` }} aria-hidden>
          <span className="seam-knob">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
            </svg>
          </span>
        </div>
      </div>

      <div className="seam-controls">
        <button type="button" aria-pressed={isTonight} className="seam-end seam-end-mf" onClick={() => setSeam(TONIGHT)}>
          Tonight · order in
        </button>
        <label className="seam-range-wrap">
          <span className="seam-caption">
            {isTonight ? 'More MoodFood · order in tonight' : isWeek ? 'More KitchenCircle · cook this week' : 'Slide · both halves of dinner'}
          </span>
          <input
            className="seam-range"
            type="range"
            min={MIN}
            max={MAX}
            step={1}
            value={Math.min(MAX, Math.max(MIN, seam))}
            onChange={(e) => setSeam(Number(e.target.value))}
            aria-label="Slide between MoodFood tonight and KitchenCircle this week"
          />
        </label>
        <button type="button" aria-pressed={isWeek} className="seam-end seam-end-kc" onClick={() => setSeam(THIS_WEEK)}>
          This week · cook at home
        </button>
      </div>
    </section>
  );
}
