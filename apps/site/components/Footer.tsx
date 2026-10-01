import Link from 'next/link';
import { APP_URL } from '@/lib/config';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <p className="footer-brand">MoodFood</p>
          <p className="muted small">Instant good mood. Made in India.</p>
        </div>
        <nav aria-label="Footer" className="footer-links">
          <a href={APP_URL}>Open the app</a>
          <Link href="/#waitlist">Join the waitlist</Link>
          <Link href="/about">About</Link>
        </nav>
        <p className="muted small footer-legal">
          © {new Date().getFullYear()} MoodFood. Swiggy is a trademark of its respective owner; MoodFood is an independent app.
        </p>
      </div>
    </footer>
  );
}
