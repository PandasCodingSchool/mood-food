import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { KcWordmark, PlanCard } from '@/components/KitchenCircle';
import { Nav } from '@/components/Nav';
import {
  KC_CHAT,
  KC_CHAT_POINTS,
  KC_COOK,
  KC_COOK_POINTS,
  KC_FAQ,
  KC_FEATURES,
  KC_GROCERY,
  KC_STEPS,
  KC_TAGLINE,
} from '@/lib/kitchen-circle';

export const metadata: Metadata = {
  title: 'KitchenCircle — plan home meals together',
  description:
    "KitchenCircle: plan the week's home cooking with your family and your cook. Auto-fill around every diet, one grocery list, and the cook's menu in their language.",
  alternates: { canonical: '/kitchen-circle' },
};

export default function KitchenCirclePage() {
  return (
    <>
      <header className="hero hero-page kc-hero">
        <div className="hero-glow" aria-hidden />
        <div className="container">
          <Nav current="kitchen-circle" />
        </div>
        <div className="container kc-hero-body">
          <div className="kc-hero-copy">
            <p className="eyebrow">KitchenCircle · this week · cook at home</p>
            <h1 className="display">{KC_TAGLINE}</h1>
            <p className="lede">
              Plan the week&rsquo;s home cooking with your family and your cook. KitchenCircle fills the empty days
              around everyone&rsquo;s diet, adds up the groceries, and sends tomorrow&rsquo;s menu to your cook in their
              own language.
            </p>
            <div className="cta-row">
              <Link className="btn btn-primary btn-lg" href="/#early-access">
                Get early access <Icon name="arrow_forward" size={20} />
              </Link>
              <a className="btn btn-ghost btn-lg" href="#how">
                See how it works
              </a>
            </div>
          </div>
          <PlanCard />
        </div>
      </header>

      <main className="kc kc-page">
        <section id="how" className="container kc-section">
          <p className="kc-eyebrow">How it works</p>
          <h2 className="h2 narrow">&ldquo;What&rsquo;s for dinner?&rdquo; answered once a week, not every evening.</h2>
          <ol className="kc-steps">
            {KC_STEPS.map((s, i) => (
              <li key={s.title} className="kc-card kc-step">
                <span className="kc-step-top">
                  <span className="kc-tile">
                    <Icon name={s.icon} size={26} />
                  </span>
                  <span className="kc-step-n">{`0${i + 1}`}</span>
                </span>
                <h3 className="h3">{s.title}</h3>
                <p className="kc-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="container kc-section kc-split">
          <div>
            <p className="kc-eyebrow">Meet Haldi</p>
            <h2 className="h2">Just say what you want.</h2>
            <p className="kc-body">
              Haldi is KitchenCircle&rsquo;s kitchen helper, in the household&rsquo;s shared chat. Ask in plain words
              and Haldi changes the plan, sets up a rule or builds the grocery list, and shows exactly what it did.
            </p>
            <ul className="kc-points">
              {KC_CHAT_POINTS.map((p) => (
                <li key={p.text}>
                  <span className="kc-point-icon">
                    <Icon name={p.icon} size={19} />
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="kc-chat" aria-label="Example chat with Haldi">
            <p className="kc-bubble kc-bubble-me">{KC_CHAT.ask}</p>
            {KC_CHAT.cards.map((c) => (
              <div key={c.title} className={`kc-action kc-action-${c.status.toLowerCase()}`}>
                <Icon name={c.icon} size={22} filled />
                <span>
                  <strong>{c.title}</strong>
                  <span className="kc-action-note">{c.note}</span>
                </span>
                <span className="kc-action-status">{c.status}</span>
              </div>
            ))}
            <p className="kc-bubble kc-bubble-haldi">
              <span className="kc-bubble-from">Haldi</span>
              {KC_CHAT.reply}
            </p>
          </div>
        </section>

        <section className="container kc-section">
          <p className="kc-eyebrow">Everything in one circle</p>
          <h2 className="h2 narrow">Built for how Indian homes actually eat.</h2>
          <ul className="kc-features">
            {KC_FEATURES.map((f) => (
              <li key={f.title} className="kc-card kc-feature">
                <span className="kc-tile">
                  <Icon name={f.icon} size={24} />
                </span>
                <h3 className="h4">{f.title}</h3>
                <p className="kc-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="kc-band">
          <div className="container kc-split kc-split-rev">
            <div className="kc-cook" aria-label="Example cook menu in Hindi">
              <ul className="kc-langs" aria-label="Languages">
                {KC_COOK.languages.map((l, i) => (
                  <li key={l} className={i === 0 ? 'kc-lang kc-lang-on' : 'kc-lang'}>
                    {l}
                  </li>
                ))}
              </ul>
              <p className="kc-cook-label">Cook view</p>
              <p className="kc-cook-day" lang="hi">
                {KC_COOK.day}
              </p>
              <p className="kc-cook-dish" lang="hi">
                {KC_COOK.dish}
              </p>
              <p className="kc-cook-people" lang="hi">
                {KC_COOK.people}
              </p>
              <ul className="kc-cook-list" lang="hi">
                {KC_COOK.ingredients.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <span className="kc-listen">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
                  <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
                Listen: ingredients
              </span>
            </div>
            <div>
              <p className="kc-eyebrow">For your cook</p>
              <h2 className="h2">The menu, in their language.</h2>
              <p className="kc-body">
                No more morning phone calls. Your cook opens one link and sees what to make, for how many, with
                ingredients and steps in eight languages, and can listen instead of reading.
              </p>
              <ul className="kc-cook-points">
                {KC_COOK_POINTS.map((p) => (
                  <li key={p.title}>
                    <span className="kc-tile kc-tile-sm">
                      <Icon name={p.icon} size={20} />
                    </span>
                    <span>
                      <strong>{p.title}</strong>
                      <span className="kc-muted">{p.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="container kc-section kc-split">
          <div>
            <p className="kc-eyebrow">Groceries</p>
            <h2 className="h2">One list for the whole week.</h2>
            <p className="kc-body">
              KitchenCircle reads every recipe on the plan, scales it to the people eating and merges the same
              ingredient across days. Fresh things wait for later in the week, and what&rsquo;s already in the kitchen
              stays off the list.
            </p>
            <div className="kc-pack">
              <span className="kc-tile kc-tile-sm">
                <Icon name="inventory_2" size={20} />
              </span>
              <p>
                <strong>Instamart, sized right.</strong> Link Swiggy and the owner can turn the list into a cart in
                one go. Need 1.65&nbsp;kg of chicken and the store sells 300&nbsp;g packs? You get 6 packs, with the reason.
              </p>
            </div>
          </div>
          <div className="kc-grocery" aria-label="Example grocery list">
            <div className="kc-plan-head">
              <strong>Groceries · this week</strong>
              <span className="kc-chip kc-chip-leaf">5 days</span>
            </div>
            {KC_GROCERY.map((g) => (
              <div key={g.group} className="kc-grocery-group">
                <p className="kc-grocery-title">{g.group}</p>
                <ul>
                  {g.items.map((it) => (
                    <li key={it.name}>
                      <span>
                        {it.name}
                        <span className="kc-grocery-from">{it.from}</span>
                      </span>
                      <span className="kc-grocery-qty">{it.qty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="container kc-section">
          <ul className="kc-trust">
            <li>
              <Icon name="lock" size={22} />
              <span>
                <strong>Your preferences stay yours.</strong> Allergies and dislikes shape the plan; nobody else sees
                your list.
              </span>
            </li>
            <li>
              <Icon name="check_circle" size={22} />
              <span>
                <strong>Nothing changes behind your back.</strong> Suggestions wait for a yes, and locked days stay
                put.
              </span>
            </li>
            <li>
              <Icon name="visibility" size={22} />
              <span>
                <strong>Your cook sees only the menu.</strong> No names, notes, prices or chats.
              </span>
            </li>
          </ul>
        </section>

        <section className="container kc-section kc-faq-section">
          <h2 className="h2">Questions</h2>
          <div className="faq kc-faq">
            {KC_FAQ.map((f, i) => (
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

        <section className="container kc-section kc-cta-section">
          <div className="kc-cta">
            <KcWordmark size="lg" />
            <h2 className="h2">One sign-up. Both doors.</h2>
            <p className="kc-body">
              The first 100 people on the list get free early access to KitchenCircle and MoodFood before the public
              launch.
            </p>
            <Link className="btn kc-btn btn-lg" href="/#early-access">
              Claim my spot <Icon name="arrow_forward" size={20} />
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
