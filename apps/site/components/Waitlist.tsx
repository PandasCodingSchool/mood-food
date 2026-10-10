'use client';

import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { API_URL, EARLY_ACCESS_SPOTS } from '@/lib/config';
import { refreshWaitlistCount, spotsLeft, useWaitlistCount } from './EarlyAccess';

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; name: string; early: boolean | null }
  | { kind: 'error'; message: string };

/** Early-access sign-up → POST /api/waitlist. The first 100 get free early access. */
export function Waitlist() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const left = spotsLeft(useWaitlistCount());

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    setState({ kind: 'sending' });
    try {
      const res = await fetch(`${API_URL}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: form.get('email'), city: form.get('city') || null }),
      });
      if (res.ok) {
        // Position = the real count right after joining (includes this sign-up).
        const after = await refreshWaitlistCount();
        setState({ kind: 'done', name, early: after == null ? null : after <= EARLY_ACCESS_SPOTS });
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
      <div className="waitlist-done" role="status">
        <span className="done-badge">
          <Icon name="check" size={34} />
        </span>
        <div>
          <p className="eyebrow">{`Welcome, ${state.name.split(/\s+/)[0] || 'friend'}`}</p>
          <p className="done-title">{state.early ? `You're one of the first ${EARLY_ACCESS_SPOTS}.` : "You're on the list."}</p>
        </div>
        <p className="done-body">
          {state.early
            ? "Free early access is yours. We'll email your invite as soon as the app is ready."
            : "We'll email you when it's your turn."}
        </p>
        <button className="link-btn" onClick={() => setState({ kind: 'idle' })}>
          Sign up someone else
        </button>
      </div>
    );
  }

  return (
    <form className="waitlist" onSubmit={submit}>
      <div className="field-row">
        <div className="field">
          <label htmlFor="wl-name">Full name</label>
          <input id="wl-name" name="name" required maxLength={255} autoComplete="name" placeholder="Aarav Mehta" />
        </div>
        <div className="field">
          <label htmlFor="wl-email">Email</label>
          <input id="wl-email" name="email" type="email" required maxLength={255} autoComplete="email" placeholder="aarav@email.com" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="wl-city">
          City <span className="optional">(optional)</span>
        </label>
        <input id="wl-city" name="city" maxLength={255} autoComplete="address-level2" placeholder="Bengaluru" />
      </div>
      <p className="form-note">We&rsquo;ll only email you about your early access. Mood data is never sold.</p>
      {state.kind === 'error' ? (
        <p className="form-error" role="alert">
          <Icon name="error" size={18} /> {state.message}
        </p>
      ) : null}
      <button className="btn btn-primary btn-lg" type="submit" disabled={state.kind === 'sending'}>
        {state.kind === 'sending' ? 'Joining…' : left === 0 ? 'Join the waitlist' : 'Claim early access'}
        <Icon name="arrow_forward" size={20} />
      </button>
      <p className="form-powered">
        Orders and delivery powered by <strong>Swiggy</strong>
      </p>
    </form>
  );
}
