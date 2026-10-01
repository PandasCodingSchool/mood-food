'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { API_URL } from '@/lib/config';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string };

/** Waitlist sign-up → POST /api/waitlist on the MoodFood API. */
export function Waitlist() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/waitlist/count`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => d?.count && setTotal(d.count))
      .catch(() => {});
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ kind: 'sending' });
    try {
      const res = await fetch(`${API_URL}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.get('name'), email: form.get('email'), city: form.get('city') || null }),
      });
      if (res.ok) {
        setState({ kind: 'done' });
        setTotal((t) => (t == null ? t : t + 1));
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setState({
        kind: 'error',
        message: res.status === 409 ? "You're already on the list. We'll be in touch." : data.error || 'Something went wrong. Please try again.',
      });
    } catch {
      setState({ kind: 'error', message: "Couldn't reach MoodFood. Check your connection and try again." });
    }
  }

  if (state.kind === 'done') {
    return (
      <div className="waitlist-done glass" role="status">
        <Icon name="check_circle" size={32} filled />
        <p className="h3">You&apos;re on the list.</p>
        <p className="muted">We&apos;ll email you when it&apos;s your turn.</p>
      </div>
    );
  }

  return (
    <form className="waitlist glass" onSubmit={submit}>
      <div className="field">
        <label htmlFor="wl-name">Name</label>
        <input id="wl-name" name="name" required maxLength={255} autoComplete="name" placeholder="Your name" />
      </div>
      <div className="field">
        <label htmlFor="wl-email">Email</label>
        <input id="wl-email" name="email" type="email" required maxLength={255} autoComplete="email" placeholder="you@example.com" />
      </div>
      <div className="field">
        <label htmlFor="wl-city">City <span className="muted">(optional)</span></label>
        <input id="wl-city" name="city" maxLength={255} autoComplete="address-level2" placeholder="Bengaluru" />
      </div>
      <button className="btn btn-primary" type="submit" disabled={state.kind === 'sending'}>
        {state.kind === 'sending' ? 'Joining…' : 'Join the waitlist'}
      </button>
      {state.kind === 'error' ? <p className="form-error" role="alert">{state.message}</p> : null}
      {total != null && total >= 50 ? <p className="muted small">{`${total.toLocaleString('en-IN')} people are already waiting.`}</p> : null}
    </form>
  );
}
