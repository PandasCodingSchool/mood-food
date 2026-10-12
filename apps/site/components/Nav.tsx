import Image from 'next/image';
import Link from 'next/link';

const HOME_LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#games', label: 'Games' },
  { href: '#swiggy', label: 'Swiggy' },
  { href: '/about', label: 'About' },
];

const PAGE_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
];

/** Sits inside each page's dark header. `current` underlines the active page. */
export function Nav({ current, cta = true }: { current?: 'home' | 'about' | 'privacy'; cta?: boolean }) {
  const links = current === 'home' ? HOME_LINKS : PAGE_LINKS;
  const here = current && current !== 'home' ? `/${current}` : null;
  return (
    <nav className="nav" aria-label="Main">
      <Link href="/" className="brand" aria-label="MoodFood home">
        <span className="brand-mark">
          <Image src="/moodfood-logo.png" alt="" width={40} height={40} loading="eager" />
        </span>
        <span>MoodFood</span>
      </Link>
      <div className="nav-links">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={l.href === here ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </div>
      {cta ? (
        <Link className="btn btn-light btn-sm" href="/#early-access">
          Get early access
        </Link>
      ) : null}
    </nav>
  );
}
