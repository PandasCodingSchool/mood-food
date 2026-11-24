'use client';

import type { Mood } from '@moodfood/tokens';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { PHONE_PICKS } from '@/lib/content';
import { COOK_LANGS, KC_DAYS, KC_TODAY, MF_GAMES, MOOD_ORDER } from '@/lib/home';
import { MOOD_OPTIONS } from '@/lib/theme';

/** 01 · MoodFood: pick a mood, see the dish and why it fits. */
export function MoodFoodChapter() {
  const [mood, setMood] = useState<Mood>('tired');
  const pick = PHONE_PICKS[mood];
  const next = () => setMood((m) => MOOD_ORDER[(MOOD_ORDER.indexOf(m) + 1) % MOOD_ORDER.length]);

  return (
    <section id="moodfood" className="chapter chapter-mf">
      {/* Old shared links point at /#how and /#games. */}
      <span id="how" className="anchor-alias" aria-hidden />
      <span id="games" className="anchor-alias" aria-hidden />
      <div className="chapter-grid">
        <div className="chapter-copy">
          <p className="chapter-kicker chapter-kicker-mf">01 · MoodFood</p>
          <h2 className="chapter-h">Twenty seconds to dinner.</h2>
          <p className="chapter-lede">
            Pick a mood. Watch the pick change, with the reason it fits. Not feeling it? Swipe, spin or bracket it out
            in a quick game.
          </p>
          <div className="mood-row" role="group" aria-label="Choose a mood">
            {MOOD_ORDER.map((id) => {
              const m = MOOD_OPTIONS.find((o) => o.id === id)!;
              return (
                <button key={id} type="button" aria-pressed={mood === id} className="mood-chip" onClick={() => setMood(id)}>
                  {m.label}
                </button>
              );
            })}
          </div>
          <ul className="mf-games">
            {MF_GAMES.map((g) => (
              <li key={g.title}>
                <strong>{g.title}</strong>
                <span>{g.desc}</span>
              </li>
            ))}
          </ul>
          <p className="chapter-more">Plus Mood Scoop, This or That, Craving Radar, Story mode and Pantry mode.</p>
        </div>

        <figure className="mf-pick" aria-live="polite">
          <Image key={pick.photo} src={`/food/${pick.photo}.jpg`} alt={pick.dish} fill sizes="(max-width: 900px) 100vw, 600px" />
          <div className="mf-pick-veil" aria-hidden />
          <figcaption>
            <span className="mf-match">{pick.match}% mood match</span>
            <span className="mf-dish">{pick.dish}</span>
            <span className="mf-meta">{pick.meta}</span>
            <span className="mf-why">&ldquo;{pick.why}&rdquo;</span>
            <span className="mf-actions">
              <a className="pill-btn pill-swiggy" href="#swiggy">
                Order on Swiggy
              </a>
              <button type="button" className="pill-btn pill-ghost" onClick={next}>
                Not feeling it
              </button>
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/** 02 · KitchenCircle: tap a day, see Haldi's changes and the cook's view. */
export function KitchenCircleChapter() {
  const [day, setDay] = useState(KC_TODAY);
  const [lang, setLang] = useState(COOK_LANGS[0].id);
  const d = KC_DAYS[day];
  const cook = COOK_LANGS.find((l) => l.id === lang)!;

  return (
    <section id="kitchencircle" className="chapter chapter-kc kc">
      <span id="kitchen-circle" className="anchor-alias" aria-hidden />
      <div className="chapter-inner">
        <div className="chapter-head">
          <div>
            <p className="chapter-kicker chapter-kicker-kc">02 · KitchenCircle</p>
            <h2 className="chapter-h">The whole household, one week.</h2>
          </div>
          <p className="chapter-lede">
            Family, roommates and your cook see the same plan. Tap a day to see what&rsquo;s cooking, who&rsquo;s eating,
            and what Haldi changed.
          </p>
        </div>

        <div className="kc-weekpick" role="group" aria-label="Pick a day">
          {KC_DAYS.map((w, i) => (
            <button key={w.day} type="button" aria-pressed={day === i} className="kc-daycard" onClick={() => setDay(i)}>
              <span className={`kc-ring kc-ring-${w.state}`}>{w.day}</span>
              <span className="kc-daycard-meal">{w.meal}</span>
              <span className="kc-daycard-note">{w.note}</span>
            </button>
          ))}
        </div>

        <div className="chapter-pair">
          <div className="kc-haldi" aria-live="polite">
            <div className="kc-haldi-head">
              <span className="kc-haldi-avatar">
                <Icon name="chat" size={22} />
              </span>
              <span>
                <strong>Haldi</strong>
                <span>Your kitchen agent · the whole household sees this chat</span>
              </span>
            </div>
            <p className="kc-bubble kc-bubble-me">{d.ask}</p>
            {d.cards.map((c) => (
              <div key={c.title} className={`kc-action kc-action-${c.status.toLowerCase()}`}>
                <Icon name={c.status === 'Done' ? 'check_circle' : 'help'} size={22} filled />
                <span>
                  <strong>{c.title}</strong>
                  <span className="kc-action-note">{c.note}</span>
                </span>
                <span className="kc-action-status">{c.status}</span>
              </div>
            ))}
            <p className="kc-bubble kc-bubble-haldi">
              <span className="kc-bubble-from">Haldi</span>
              {d.reply}
            </p>
            <div className="kc-haldi-input" aria-hidden>
              <span>Ask Haldi, e.g. &ldquo;We&rsquo;re going out Friday&rdquo;</span>
              <span className="kc-haldi-mic">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </span>
            </div>
          </div>

          <div className="kc-cookview">
            <div className="kc-cook-langs" role="group" aria-label="Cook's language">
              {COOK_LANGS.map((l) => (
                <button key={l.id} type="button" aria-pressed={lang === l.id} lang={l.lang} onClick={() => setLang(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
            <div lang={cook.lang} className="kc-cookview-body" aria-live="polite">
              <span className="kc-cookview-day">{cook.day}</span>
              <strong className="kc-cookview-dish">{cook.dish}</strong>
              <span className="kc-cookview-people">{cook.people}</span>
              <ul>
                {cook.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
            <div className="kc-cookview-foot">
              <span className="kc-cookview-chip">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
                </svg>
                <span lang={cook.lang}>{cook.listen}</span>
              </span>
              <span className="kc-cookview-chip kc-cookview-chip-muted">Private link · no app for your cook</span>
            </div>
          </div>
        </div>

        <Link className="pill-btn pill-kc chapter-link" href="/kitchen-circle">
          Explore KitchenCircle <Icon name="arrow_forward" size={18} />
        </Link>
      </div>
    </section>
  );
}
