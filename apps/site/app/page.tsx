import { hueTile } from '@moodfood/tokens';
import { Icon } from '@/components/Icon';
import { PhoneMock } from '@/components/PhoneMock';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { Waitlist } from '@/components/Waitlist';
import { EarlyAccessPill } from '@/components/EarlyAccess';
import { PoweredBySwiggy } from '@/components/PoweredBySwiggy';
import { StoreButtons } from '@/components/StoreButtons';
import { EARLY_ACCESS_SPOTS } from '@/lib/config';
import { FAQ, FEATURES, GAMES, STEPS } from '@/lib/content';

export default function Home() {
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <EarlyAccessPill />
          <p className="label">Mood × time × weather</p>
          <h1 className="display">Food that matches your mood.</h1>
          <p className="lede">
            Tell MoodFood how you feel, play a 30-second game, and get three dishes worth ordering. Then order them on
            Swiggy without leaving the app.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="#waitlist">
              Claim free early access <Icon name="arrow_forward" size={18} />
            </a>
          </div>
          <StoreButtons />
          <PoweredBySwiggy className="hero-powered" />
          <ThemeSwitcher />
          <p className="muted small">Tap a mood or a time. The whole page re-themes, just like the app does.</p>
        </div>
        <div className="hero-visual">
          <PhoneMock />
        </div>
      </section>

      <section id="how" className="section container">
        <p className="label">How it works</p>
        <h2 className="h2">From “I’m hungry” to dinner in under a minute.</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card glass">
              <span className="step-n label">{`0${i + 1}`}</span>
              <span className="tile tile-acc">
                <Icon name={s.icon} size={24} />
              </span>
              <h3 className="h3">{s.title}</h3>
              <p className="muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="games" className="section container">
        <p className="label">Decision games</p>
        <h2 className="h2">Can’t decide? Play for it.</h2>
        <p className="lede">Eight quick games that turn “whatever” into a craving. Each result is already filtered for your mood.</p>
        <ul className="games">
          {GAMES.map((g) => (
            <li key={g.title} className="card glass game">
              <span className="tile" style={{ background: hueTile(g.hue) }}>
                <Icon name={g.icon} size={22} />
              </span>
              {g.tag ? <span className="tag">{g.tag}</span> : null}
              <h3 className="h4">{g.title}</h3>
              <p className="muted small">{g.desc}</p>
              <p className="label">{g.time}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="features" className="section container">
        <p className="label">Built for real dinners</p>
        <h2 className="h2">Everything after “what should I eat?”</h2>
        <ul className="features">
          {FEATURES.map((f) => (
            <li key={f.title} className="feature">
              <span className="tile tile-glass">
                <Icon name={f.icon} size={22} />
              </span>
              <div>
                <h3 className="h4">{f.title}</h3>
                <p className="muted">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="waitlist" className="section container split">
        <div>
          <p className="label">Early access</p>
          <h2 className="h2">{`The first ${EARLY_ACCESS_SPOTS} get in free.`}</h2>
          <p className="lede">
            MoodFood is launching on iPhone and Android soon. The first {EARLY_ACCESS_SPOTS} people to sign up get free
            early access before the public launch.
          </p>
          <StoreButtons />
        </div>
        <Waitlist />
      </section>

      <section id="faq" className="section container">
        <p className="label">Questions</p>
        <h2 className="h2">Good to know</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q} className="glass">
              <summary>
                {f.q}
                <Icon name="expand_more" size={22} className="chev" />
              </summary>
              <p className="muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
