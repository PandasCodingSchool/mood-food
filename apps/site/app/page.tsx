import { hueTile } from '@moodfood/tokens';
import Image from 'next/image';
import { EarlyAccessPill, SpotsMeter, SpotsText } from '@/components/EarlyAccess';
import { HeroDemo } from '@/components/HeroDemo';
import { Icon } from '@/components/Icon';
import { Nav } from '@/components/Nav';
import { PartnerLockup, PoweredBySwiggy } from '@/components/PoweredBySwiggy';
import { Waitlist } from '@/components/Waitlist';
import { FAQ, GAMES, HERO_PHOTOS, PERKS, SIGNALS, STEPS, SWIGGY_POINTS, TICKER } from '@/lib/content';

function Ticker() {
  const items = (copy: number) =>
    TICKER.map(([moment, dish]) => (
      <span key={`${copy}-${dish}`} className="ticker-item">
        <span className="ticker-moment">{moment}</span>
        <Icon name="arrow_forward" size={22} className="ticker-arrow" />
        {dish}
        <span className="ticker-dot" />
      </span>
    ));
  return (
    <div className="ticker">
      <div className="ticker-mask">
        <div className="ticker-track">
          {items(0)}
          <span aria-hidden className="ticker-copy">
            {items(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <header className="hero hero-home">
        <div className="hero-wall" aria-hidden>
          {HERO_PHOTOS.map((p) => (
            <div key={p} className="hero-wall-cell">
              <Image src={`/food/${p}.jpg`} alt="" fill sizes="(max-width: 700px) 50vw, 25vw" />
            </div>
          ))}
        </div>
        <div className="hero-veil" aria-hidden />
        <div className="container">
          <Nav current="home" />
        </div>
        <div id="top" className="container hero-body">
          <div className="hero-copy">
            <EarlyAccessPill />
            <p className="eyebrow eyebrow-acc hero-kicker">Tired · rainy · 7:48 PM</p>
            <h1 className="display">Tell us how you feel. We&rsquo;ll handle dinner.</h1>
            <p className="lede">
              No more 40-minute scroll. MoodFood picks the dish that fits your mood, your weather and your evening, then
              Swiggy brings it over.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary btn-lg" href="#early-access">
                Claim my spot <Icon name="arrow_forward" size={20} />
              </a>
              <SpotsText />
            </div>
            <PoweredBySwiggy className="hero-powered" />
          </div>
          <HeroDemo />
        </div>
        <Ticker />
      </header>

      <main>
        <section className="section container">
          <p className="eyebrow eyebrow-acc">It reads the room</p>
          <h2 className="h2 narrow">Not just what you like. What you need right now.</h2>
          <ul className="signals">
            {SIGNALS.map((s) => (
              <li key={s.title} className="card signal">
                <span className="tile tile-lg" style={{ background: hueTile(s.hue) }}>
                  <Icon name={s.icon} size={28} />
                </span>
                <h3 className="h3">{s.title}</h3>
                <p className="muted">{s.body}</p>
                <div className="signal-photo">
                  <Image src={`/food/${s.photo}.jpg`} alt="" fill sizes="(max-width: 700px) 100vw, 380px" />
                  <p className="signal-example">
                    <Icon name="auto_awesome" size={18} />
                    <span>{s.example}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" className="section container">
          <div className="section-head">
            <div>
              <p className="eyebrow eyebrow-acc">How it works</p>
              <h2 className="h2">Twenty seconds to dinner.</h2>
            </div>
            <p className="muted section-aside">No endless scrolling. No 40-tab debate. Check in, see your match, eat.</p>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card step">
                <span className="step-n">{`0${i + 1}`}</span>
                <h3 className="h3">{s.title}</h3>
                <p className="muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="games" className="section band">
          <div className="container">
            <p className="eyebrow eyebrow-acc">Decision modes</p>
            <h2 className="h2 narrow">Can&rsquo;t decide? Play it out.</h2>
            <p className="muted section-lede">
              Quick games, each already filtered to your mood, so there&rsquo;s no bad outcome. Swipe, spin, battle it
              out in a bracket, or cook from what&rsquo;s in the fridge.
            </p>
            <ul className="games">
              {GAMES.map((g) => (
                <li key={g.title} className="card game">
                  <span className="tile" style={{ background: hueTile(g.hue) }}>
                    <Icon name={g.icon} size={24} />
                  </span>
                  <div>
                    <h3 className="h4">
                      {g.title}
                      {g.soon ? <span className="tag">Coming soon</span> : null}
                    </h3>
                    <p className="muted small">{g.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="swiggy" className="swiggy-wrap">
          <div className="swiggy-panel">
            <div className="swiggy-ring" aria-hidden />
            <div className="swiggy-copy">
              <PartnerLockup />
              <h2 className="display-md">Powered by Swiggy.</h2>
              <p className="swiggy-lede">
                MoodFood decides. Swiggy delivers. Same restaurants you already love, same riders, same checkout, now with
                a brain for what you&rsquo;re in the mood for.
              </p>
            </div>
            <ul className="swiggy-points">
              {SWIGGY_POINTS.map((p) => (
                <li key={p.title}>
                  <span className="swiggy-icon">
                    <Icon name={p.icon} size={24} />
                  </span>
                  <div>
                    <h3 className="h4">{p.title}</h3>
                    <p>{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="early-access" className="section">
          {/* Old shared links point at /#waitlist. */}
          <span id="waitlist" className="anchor-alias" aria-hidden />
          <div className="container">
            <div className="ea-panel">
              <div className="ea-glow" aria-hidden />
              <div className="ea-copy">
                <p className="eyebrow">Founding members</p>
                <h2 className="display-md">Claim your early access.</h2>
                <p className="lede">
                  MoodFood is coming soon to iPhone and Android. The first 100 people to sign up get free early access
                  before the public launch.
                </p>
                <ul className="perks">
                  {PERKS.map((p) => (
                    <li key={p.text}>
                      <span className="perk-icon">
                        <Icon name={p.icon} size={19} />
                      </span>
                      {p.text}
                    </li>
                  ))}
                </ul>
                <SpotsMeter />
              </div>
              <div className="ea-form">
                <Waitlist />
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="section container faq-section">
          <h2 className="h2">Questions</h2>
          <div className="faq">
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>
                  {f.q}
                  <Icon name="add" size={24} className="faq-icon" />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
