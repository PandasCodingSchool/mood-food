import { hueTile } from '@moodfood/tokens';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Nav } from '@/components/Nav';
import { PartnerLockup } from '@/components/PoweredBySwiggy';
import { CONTACT_EMAIL, EARLY_ACCESS_SPOTS } from '@/lib/config';
import { RULES } from '@/lib/content';

export const metadata: Metadata = {
  title: 'About',
  description: 'Why we built MoodFood: deciding what to eat should take seconds, not forty minutes of scrolling.',
};

export default function About() {
  return (
    <>
      <header className="hero hero-page">
        <div className="hero-glow" aria-hidden />
        <div className="container">
          <Nav current="about" />
        </div>
        <div className="container hero-page-body">
          <p className="eyebrow">About us</p>
          <h1 className="display">We got tired of asking &ldquo;what should we eat?&rdquo;</h1>
          <p className="lede">
            MoodFood started after one too many forty-minute scrolls that ended in the same order as always. We figured
            the app should know you were tired, that it was pouring, and that it was already 9 PM.
          </p>
        </div>
      </header>

      <main className="paper">
        <section className="container story">
          <div className="story-photos" aria-hidden>
            <div className="story-photo story-photo-tall">
              <Image src="/food/biryani.jpg" alt="" fill sizes="(max-width: 900px) 50vw, 300px" />
            </div>
            <div className="story-photo">
              <Image src="/food/masala-dosa.jpg" alt="" fill sizes="(max-width: 900px) 50vw, 300px" />
            </div>
            <div className="story-photo">
              <Image src="/food/banana-leaf.jpg" alt="" fill sizes="(max-width: 900px) 50vw, 300px" />
            </div>
          </div>
          <div>
            <p className="eyebrow">Our story</p>
            <h2 className="h2">Food apps know what you ordered. Not how you felt.</h2>
            <p className="body-lg">
              Most recommendations look backwards: you liked biryani once, so here&rsquo;s more biryani. But what you
              want depends on right now. A long day calls for something warm and easy. Good news calls for something
              loud. A storm calls for whatever reaches you hot.
            </p>
            <p className="body-lg">
              So we built a 20-second mood check-in, taught it to read the weather and the clock, and connected it to
              Swiggy so the answer is one tap away.
            </p>
          </div>
        </section>

        <section className="container section-tight">
          <p className="eyebrow">What we believe</p>
          <h2 className="h2">Four rules we build by.</h2>
          <ul className="rules">
            {RULES.map((r) => (
              <li key={r.title} className="paper-card rule">
                <span className="tile" style={{ background: hueTile(r.hue) }}>
                  <Icon name={r.icon} size={26} />
                </span>
                <h3 className="h4">{r.title}</h3>
                <p>{r.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="swiggy-wrap swiggy-wrap-paper">
          <div className="swiggy-panel swiggy-panel-row">
            <div className="swiggy-copy">
              <p className="eyebrow eyebrow-ink">Our partner</p>
              <h2 className="display-md">We decide. Swiggy delivers.</h2>
              <p className="swiggy-lede">
                MoodFood is powered by Swiggy. Every restaurant, rider, payment and live-tracking update runs on the
                platform you already trust. We just make the choosing easier.
              </p>
            </div>
            <PartnerLockup size={72} />
          </div>
        </section>

        <section className="container contact">
          <div className="contact-card contact-dark">
            <h2 className="h3">{`Join the first ${EARLY_ACCESS_SPOTS}.`}</h2>
            <p>The first {EARLY_ACCESS_SPOTS} sign-ups get the app free, before anyone else, and help shape what it becomes.</p>
            <Link className="btn btn-primary" href="/#early-access">
              Claim early access <Icon name="arrow_forward" size={19} />
            </Link>
          </div>
          <div className="paper-card contact-card">
            <h2 className="h3">Say hello.</h2>
            <p>Press, partnerships, restaurants or just a great idea for a mood we missed.</p>
            <a className="contact-email" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
