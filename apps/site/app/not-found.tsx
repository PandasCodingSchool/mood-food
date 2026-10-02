import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="container prose">
      <p className="label">404</p>
      <h1 className="display">Nothing on this plate.</h1>
      <p>That page doesn’t exist. Let’s get you back to the menu.</p>
      <Link className="btn btn-primary" href="/">
        Back home
      </Link>
    </section>
  );
}
