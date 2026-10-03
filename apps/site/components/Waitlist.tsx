'use client';

import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { API_URL, EARLY_ACCESS_SPOTS } from '@/lib/config';
import { spotsLeft, useWaitlistCount } from './EarlyAccess';

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; early: boolean | null }
  | { kind: 'error'; message: string };

/** Early-access sign-up → POST /api/waitlist. The first 100 get free early access. */
export function Waitlist() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [count, setCount] = useWaitlistCount();
  const left = spotsLeft(count);

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
        // Position = the real count right after joining (includes this sign-up).
        const after = await fetch(`${API_URL}/waitlist/count`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { count?: number } | null) => (typeof d?.count === 'number' ? d.count : null))
          .catch(() => null);
        if (after != null) setCount(after);
        setState({ kind: 'done', early: after == null ? null : after <= EARLY_ACCESS_SPOTS });
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
        <Icon name={state.early ? 'workspace_premium' : 'check_circle'} size={32} filled />
        <p className="h3">{state.early ? `You're one of the first ${EARLY_ACCESS_SPOTS}.` : "You're on the list."}</p>
        <p className="muted">
          {state.early
            ? "Free early access is yours. We'll email your invite as soon as the app is ready."
            : "We'll email you when it's your turn."}
        </p>
      </div>
    );
  }

  return (
    <form className="waitlist glass" onSubmit={submit}>
      {left != null ? (
        <div className="spots">
          <div className="spots-row">
            <span className="h4">{left > 0 ? `${left} of ${EARLY_ACCESS_SPOTS} early-access spots left` : 'Early access is full'}</span>
            <Icon name="workspace_premium" size={22} />
          </div>
          <div className="spots-track" aria-hidden>
            <div className="spots-fill" style={{ width: `${Math.min(100, ((EARLY_ACCESS_SPOTS - left) / EARLY_ACCESS_SPOTS) * 100)}%` }} />
          </div>
        </div>
      ) : null}
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
        {state.kind === 'sending' ? 'Joining…' : left === 0 ? 'Join the waitlist' : 'Claim free early access'}
      </button>
      {state.kind === 'error' ? <p className="form-error" role="alert">{state.message}</p> : null}
    </form>
  );
}
