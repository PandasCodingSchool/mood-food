import Link from 'next/link';
import { PoweredBySwiggy } from './PoweredBySwiggy';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <p className="footer-brand">MoodFood</p>
          <p className="muted small">Instant good mood. Made in India.</p>
          <PoweredBySwiggy className="footer-powered" />
        </div>
        <nav aria-label="Footer" className="footer-links">
          <Link href="/#waitlist">Get early access</Link>
          <Link href="/#faq">FAQ</Link>
          <Link href="/about">About</Link>
        </nav>
        <p className="muted small footer-legal">
          © {new Date().getFullYear()} MoodFood. Food ordering powered by Swiggy. Swiggy is a trademark of its respective owner.
        </p>
      </div>
    </footer>
  );
}
