import type { Metadata } from 'next';
import Link from 'next/link';
import { PoweredBySwiggy } from '@/components/PoweredBySwiggy';

export const metadata: Metadata = {
  title: 'About',
  description: 'Why we built MoodFood: deciding what to eat should take seconds, not half an hour of scrolling.',
};

export default function About() {
  return (
    <article className="container prose">
      <p className="label">About MoodFood</p>
      <h1 className="display">What you eat should fit how you feel.</h1>
      <p>
        Most food apps ask what you want. Most nights, you don’t know. You scroll, give up, and order the same thing as
        last week.
      </p>
      <p>
        MoodFood starts from how you feel instead. A quick check-in or a 30-second game, plus the time of day and the
        weather, is enough to suggest three dishes with a reason for each. Order on Swiggy without leaving the app, or
        get the recipe and cook it yourself.
      </p>
      <h2 className="h3">Powered by Swiggy</h2>
      <p>
        Menus, prices, carts, checkout and live order tracking come straight from Swiggy, so what you see in MoodFood is
        what the restaurant actually has right now.
      </p>
      <PoweredBySwiggy />
      <h2 className="h3">It gets better the more you use it</h2>
      <p>
        Every swipe, pick and “how did that feel?” teaches MoodFood your taste. There’s no long setup quiz. It learns
        as you go.
      </p>
      <h2 className="h3">Your mood is yours</h2>
      <p>
        Mood data stays on your account and is never sold. Story mode reads what you write on your phone and sends
        only the moods it detects.
      </p>
      <p>
        <Link className="btn btn-primary" href="/#waitlist">
          Get early access
        </Link>
      </p>
    </article>
  );
}
