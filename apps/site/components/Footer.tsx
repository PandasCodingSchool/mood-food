import Image from 'next/image';
import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/config';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div className="footer-brand">
          <span className="brand-mark brand-mark-sm">
            <Image src="/moodfood-logo.png" alt="" width={38} height={38} />
          </span>
          <div>
            <p className="footer-name">MoodFood</p>
            <p className="footer-tag">Made in India · Powered by Swiggy</p>
          </div>
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
