import Image from 'next/image';
import Link from 'next/link';
import { APP_URL } from '@/lib/config';

export function Nav() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label="MoodFood home">
          <Image src="/moodfood-logo.png" alt="" width={36} height={36} priority />
          <span>MoodFood</span>
        </Link>
        <nav aria-label="Main" className="nav-links">
          <Link href="/#how">How it works</Link>
          <Link href="/#games">Games</Link>
          <Link href="/#features">Features</Link>
          <Link href="/about">About</Link>
        </nav>
        <a className="btn btn-primary btn-sm" href={APP_URL}>
          Open MoodFood
        </a>
      </div>
    </header>
  );
}
