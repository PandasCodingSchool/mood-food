import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { KC_TAGLINE, KC_WEEK, type RingState } from '@/lib/kitchen-circle';

// KitchenCircle brand pieces for the site, drawn after apps/mobile/src/features/kitchen-circle
// (brand.ts, components.tsx). Styles live under "KitchenCircle" in app/globals.css.

export function KcWordmark({ size = 'md', tagline = true }: { size?: 'sm' | 'md' | 'lg'; tagline?: boolean }) {
  const px = { sm: 36, md: 46, lg: 60 }[size];
  return (
    <span className={`kc-wordmark kc-wordmark-${size}`}>
      <Image src="/kitchen-circle-mark.png" alt="" width={px} height={px} className="kc-mark" />
      <span>
        <span className="kc-word">
          kitchen<span className="kc-word-acc">circle</span>
        </span>
        {tagline ? <span className="kc-tagline">{KC_TAGLINE}</span> : null}
      </span>
    </span>
  );
}

const RING_LABEL: Record<RingState, string> = {
  cooked: 'cooked',
  today: 'today',
  planned: 'planned',
  blank: 'not planned yet',
};

export function DayRings({ week = KC_WEEK }: { week?: typeof KC_WEEK }) {
  return (
    <ol className="kc-rings" aria-label="This week">
      {week.map((d) => (
        <li key={d.day} className={`kc-ring kc-ring-${d.state}`} aria-label={`${d.day}, ${RING_LABEL[d.state]}: ${d.meal}`}>
          {d.day}
        </li>
      ))}
    </ol>
  );
}

/** The hero mock: one household's week. Illustrative, not live data. */
export function PlanCard() {
  return (
    <div className="kc-plan" aria-label="Example KitchenCircle week">
      <div className="kc-plan-head">
        <KcWordmark size="sm" tagline={false} />
        <span className="kc-chip kc-chip-leaf">This week</span>
      </div>
      <DayRings />
      <ul className="kc-days">
        {KC_WEEK.slice(2, 6).map((d) => (
          <li key={d.day} className={`kc-day kc-day-${d.state}`}>
            <span className="kc-day-name">{d.day}</span>
            <span className="kc-day-body">
              <span className="kc-day-meal">{d.meal}</span>
              <span className="kc-day-note">{d.note}</span>
            </span>
            {d.state === 'today' ? <span className="kc-chip kc-chip-haldi">Today</span> : null}
          </li>
        ))}
      </ul>
      <div className="kc-suggest">
        <span className="kc-suggest-icon">
          <Icon name="auto_awesome" size={18} />
        </span>
        <span>
          <strong>Haldi suggests Vegetable pulao for Friday.</strong> Everyone can eat it, ready in 30 min.
        </span>
      </div>
    </div>
  );
}

const TEASER_POINTS = [
  { icon: 'auto_awesome', text: 'Fills the open days around every diet and allergy' },
  { icon: 'receipt_long', text: 'One grocery list for the week, Instamart-ready' },
  { icon: 'language', text: "Your cook's menu in their language, read aloud" },
  { icon: 'chat', text: 'Just tell Haldi what you want, in words or a voice note' },
] as const;

/** Home-page section introducing KitchenCircle. */
export function KitchenCircleTeaser() {
  return (
    <section id="kitchen-circle" className="kc-wrap">
      <div className="kc kc-teaser">
        <div className="kc-teaser-copy">
          <span className="kc-new">New in MoodFood</span>
          <KcWordmark size="md" />
          <h2 className="h2">Cooking at home? Plan the whole week together.</h2>
          <p className="kc-lede">
            KitchenCircle is the home-cooking side of MoodFood. Your family plans one week of meals, the groceries add
            themselves up, and your cook knows what to make tomorrow.
          </p>
          <ul className="kc-points">
            {TEASER_POINTS.map((p) => (
              <li key={p.text}>
                <span className="kc-point-icon">
                  <Icon name={p.icon} size={19} />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
          <Link className="btn kc-btn" href="/kitchen-circle">
            Explore KitchenCircle <Icon name="arrow_forward" size={20} />
          </Link>
        </div>
        <PlanCard />
      </div>
    </section>
  );
}
