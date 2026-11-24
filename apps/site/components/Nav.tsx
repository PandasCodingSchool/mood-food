import Image from 'next/image';
import Link from 'next/link';

const HOME_LINKS = [
  { href: '#moodfood', label: 'MoodFood', tone: 'mf' },
  { href: '#kitchencircle', label: 'KitchenCircle', tone: 'kc' },
  { href: '#together', label: 'How they connect' },
  { href: '#swiggy', label: 'Swiggy' },
];

const PAGE_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/kitchen-circle', label: 'KitchenCircle' },
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
];

/** MoodFood + KitchenCircle, side by side as equals. */
export function DualLockup() {
  return (
    <span className="dual-lockup">
      {/* Transparent wordmark (cream ink for dark grounds); it already reads "MoodFood". */}
      <Image src="/moodfood-mark-dark.png" alt="MoodFood" width={56} height={48} loading="eager" className="brand-logo" />
      <span className="dual-plus" aria-hidden>
        +
      </span>
      <span className="dual-kc">
        <Image src="/kitchen-circle-mark.png" alt="" width={28} height={28} className="kc-mark" />
        <span className="dual-kc-word">
          kitchen<span>circle</span>
        </span>
        <span className="sr-only">KitchenCircle</span>
      </span>
    </span>
  );
}

/**
 * Sits inside each page's header. On home it rides the split night/day bar;
 * `current` underlines the active page elsewhere.
 */
export function Nav({ current, cta = true }: { current?: 'home' | 'about' | 'privacy' | 'kitchen-circle'; cta?: boolean }) {
  const home = current === 'home';
  const links = home ? HOME_LINKS : PAGE_LINKS;
  const here = current && !home ? `/${current}` : null;
  return (
    <nav className={home ? 'nav nav-split' : 'nav'} aria-label="Main">
      <Link href="/" className="brand" aria-label="MoodFood and KitchenCircle home">
        <DualLockup />
      </Link>
      <div className="nav-links">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.href === here ? 'page' : undefined}
            className={'tone' in l && l.tone ? `nav-tone nav-tone-${l.tone}` : undefined}
          >
            {l.label}
          </Link>
        ))}
      </div>
      {cta ? (
        <Link className="btn btn-sm nav-cta" href="/#early-access">
          <span className="nav-cta-get">Get </span>early access
        </Link>
      ) : null}
    </nav>
  );
}
