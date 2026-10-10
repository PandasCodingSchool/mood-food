import Link from 'next/link';
import { Nav } from '@/components/Nav';

export default function NotFound() {
  return (
    <>
      <header className="legal-head">
        <div className="container">
          <Nav />
        </div>
      </header>
      <main className="container not-found">
        <p className="eyebrow">404</p>
        <h1 className="display">Nothing on this plate.</h1>
        <p>That page doesn’t exist. Let’s get you back to the menu.</p>
        <Link className="btn btn-primary" href="/">
          Back home
        </Link>
      </main>
    </>
  );
}
