import { MOOD_SPECS, type Mood } from '@moodfood/tokens';
import Image from 'next/image';
import { Icon } from '@/components/Icon';
import { PHONE_PICKS } from '@/lib/content';
import { themeStyle } from '@/lib/theme';

// A drawing of the app's home screen in its evening/rainy theme, using the same
// tokens as the app. Picks per mood are illustrative examples, not live data.
export function PhoneMock({ mood }: { mood: Mood }) {
  const pick = PHONE_PICKS[mood];
  return (
    <div
      className="phone"
      style={themeStyle({ time: 'evening', weather: 'rainy', mood })}
      aria-label={`MoodFood home screen: ${MOOD_SPECS[mood].label.toLowerCase()} on a rainy evening, suggesting ${pick.dish}`}
      role="img"
    >
      <div className="phone-screen">
        <div className="phone-status">
          <span>7:48</span>
          <span className="phone-notch" />
          <Icon name="signal_cellular_alt" size={14} />
        </div>
        <p className="phone-eyebrow">{`${MOOD_SPECS[mood].label} · Rainy · Evening`}</p>
        <p className="phone-title">Picked for right now</p>
        <div className="phone-hero">
          {/* All four photos stay mounted so switching moods crossfades instead of loading. */}
          {Object.values(PHONE_PICKS).map((p) => (
            <Image
              key={p.photo}
              src={`/food/${p.photo}.jpg`}
              alt=""
              fill
              sizes="320px"
              loading="eager"
              className="phone-photo"
              data-on={p.photo === pick.photo}
            />
          ))}
          <div className="phone-scrim" />
          <span className="match">
            <Icon name="auto_awesome" size={13} /> {pick.match}% match
          </span>
          <div className="phone-hero-copy">
            <p className="phone-dish">{pick.dish}</p>
            <p className="phone-meta">{pick.meta}</p>
            <p className="phone-why">{pick.why}</p>
            <div className="phone-actions">
              <span className="pill pill-acc">Order on Swiggy</span>
              <span className="pill pill-glass">See why</span>
            </div>
          </div>
        </div>
        <div className="phone-chips">
          <span className="pill pill-glass">
            <Icon name="swipe" size={14} /> Snack Match
          </span>
          <span className="pill pill-glass">
            <Icon name="casino" size={14} /> Roulette
          </span>
        </div>
        <div className="phone-tab">
          <Icon name="home" size={18} />
          <Icon name="auto_awesome" size={18} />
          <span className="phone-fab">
            <Icon name="mood" size={20} />
          </span>
          <Icon name="stadia_controller" size={18} />
          <Icon name="person" size={18} />
        </div>
      </div>
    </div>
  );
}
