import { SpotsMeter } from '@/components/EarlyAccess';
import { KitchenCircleChapter, MoodFoodChapter } from '@/components/Chapters';
import { Icon } from '@/components/Icon';
import { Nav } from '@/components/Nav';
import { SeamHero } from '@/components/SeamHero';
import { Waitlist } from '@/components/Waitlist';
import { FAQ } from '@/lib/content';
import { DUAL_TICKER } from '@/lib/home';

function Ticker() {
  const items = (copy: number) =>
    DUAL_TICKER.map((t) => (
      <span key={`${copy}-${t.dish}`} className="ticker-item">
        <span className={t.tag === 'MoodFood' ? 'ticker-tag ticker-tag-mf' : 'ticker-tag ticker-tag-kc'}>{t.tag}</span>
        <span className="ticker-moment">{t.moment}</span>
        {t.dish}
        <span className="ticker-dot" />
      </span>
    ));
  return (
    <div className="ticker ticker-dual">
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
      <header className="home-header">
        <div className="home-bar">
          <div className="container">
            <Nav current="home" />
          </div>
        </div>
        <SeamHero />
        <Ticker />
      </header>

      <main>
        <section id="together" className="together">
          <div className="together-inner">
            <div className="together-head">
              <p className="chapter-kicker chapter-kicker-mf">One app · two ways to eat</p>
              <h2 className="chapter-h">Order when you&rsquo;re tired. Cook when you&rsquo;re together. It remembers both.</h2>
            </div>
            <div className="together-grid">
              <article className="together-card together-mf">
                <span className="together-tag">MoodFood</span>
                <h3>Learns your moods</h3>
                <ul>
                  <li>Check-ins: tired, happy, stressed</li>
                  <li>What you ordered, and how you felt after</li>
                  <li>Rain, heat and 2 AM cravings</li>
                </ul>
                <span className="together-flow">Gives → your taste</span>
              </article>
              <article className="together-card together-core">
                <span className="together-heart" aria-hidden>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" />
                  </svg>
                </span>
                <h3>Your taste</h3>
                <p>Diets, allergies and the cuisines you love. Set once, kept by both. Allergies are never a suggestion.</p>
              </article>
              <article className="together-card together-kc">
                <span className="together-tag">KitchenCircle</span>
                <h3>Learns your household</h3>
                <ul>
                  <li>Who&rsquo;s eating, every day</li>
                  <li>House rules: veg Tuesdays, quick weeknights</li>
                  <li>Loved it, change something, skipped</li>
                </ul>
                <span className="together-flow">your taste ← Gives</span>
              </article>
            </div>
            <p className="together-note">Use one, or both. Each works on its own, and Swiggy powers both.</p>
          </div>
        </section>

        <MoodFoodChapter />

        <div className="chapter-seam" aria-hidden />

        <KitchenCircleChapter />

        <section id="swiggy" className="swiggy-dual">
          <div className="swiggy-dual-grid">
            <div className="swiggy-half swiggy-half-food">
              <span className="swiggy-half-tag">Powered by Swiggy · Food</span>
              <h2>Tonight&rsquo;s dish, delivered.</h2>
              <p>MoodFood picks from Swiggy restaurants near you. Live menus, live prices, and the checkout and riders you trust.</p>
            </div>
            <div className="swiggy-half swiggy-half-im">
              <span className="swiggy-half-tag">Powered by Swiggy · Instamart</span>
              <h2>The week&rsquo;s groceries, in one cart.</h2>
              <p>KitchenCircle turns the plan into real Instamart packs at real prices. Nothing is ordered until the owner checks the cart.</p>
            </div>
          </div>
        </section>

        <section id="early-access" className="ea-dual">
          {/* Old shared links point at /#waitlist. */}
          <span id="waitlist" className="anchor-alias" aria-hidden />
          <div className="ea-dual-grid">
            <div className="ea-dual-copy">
              <p className="chapter-kicker chapter-kicker-mf">Founding members</p>
              <h2 className="chapter-h">One sign-up. Both doors.</h2>
              <p className="chapter-lede">
                The first 100 people get free early access to MoodFood and KitchenCircle on iPhone and Android, before the
                public launch.
              </p>
              <SpotsMeter />
            </div>
            <div className="ea-form ea-dual-form">
              <Waitlist />
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
