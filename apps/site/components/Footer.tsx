import Link from 'next/link';
import { DualLockup } from '@/components/Nav';
import { CONTACT_EMAIL } from '@/lib/config';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div className="footer-brand">
          <DualLockup />
          <p className="footer-tag">Made in India, for every way India eats · Powered by Swiggy</p>
        </div>
        <nav aria-label="Footer" className="footer-links">
          <Link href="/#moodfood">MoodFood</Link>
          <Link href="/kitchen-circle">KitchenCircle</Link>
          <Link href="/about">About us</Link>
          <Link href="/privacy">Privacy policy</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </nav>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} MoodFood. All rights reserved.</span>
        <span>Food and Instamart ordering powered by Swiggy. Swiggy is a trademark of its respective owner.</span>
      </div>
    </footer>
  );
}
