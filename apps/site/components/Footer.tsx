import Image from 'next/image';
import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/config';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div className="footer-brand">
          <Image src="/moodfood-mark-dark.png" alt="MoodFood" width={66} height={56} className="brand-logo" />
          <p className="footer-tag">Made in India · Powered by Swiggy</p>
        </div>
        <nav aria-label="Footer" className="footer-links">
          <Link href="/about">About us</Link>
          <Link href="/privacy">Privacy policy</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </nav>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} MoodFood. All rights reserved.</span>
        <span>Food ordering powered by Swiggy. Swiggy is a trademark of its respective owner.</span>
      </div>
    </footer>
  );
}
