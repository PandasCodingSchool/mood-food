'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Icon } from '@/components/Icon';
import { API_URL, EARLY_ACCESS_SPOTS } from '@/lib/config';

// One shared waitlist count for the whole page: the hero, the spots bar and the
// form all read it, and a successful sign-up refreshes it for every reader.
let count: number | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setWaitlistCount(n: number) {
  count = n;
  listeners.forEach((l) => l());
}

/** Fetches the real count from the API. Resolves to null if unreachable. */
export async function refreshWaitlistCount(): Promise<number | null> {
  const n = await fetch(`${API_URL}/waitlist/count`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { count?: number } | null) => (typeof d?.count === 'number' ? d.count : null))
    .catch(() => null);
  if (n != null) setWaitlistCount(n);
  return n;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Real waitlist count from the API (null until loaded or if unreachable). */
export function useWaitlistCount() {
  useEffect(() => {
    loading ??= refreshWaitlistCount().then(() => {});
  }, []);
  return useSyncExternalStore(subscribe, () => count, () => null);
}

export const spotsLeft = (n: number | null) => (n == null ? null : Math.max(0, EARLY_ACCESS_SPOTS - n));

/** Hero announcement pill. */
export function EarlyAccessPill() {
  const left = spotsLeft(useWaitlistCount());
  return (
    <a className="announce" href="#early-access">
      <span className="announce-dot" aria-hidden />
      {left === 0 ? 'Early access is full · join the waitlist' : `Early access open · first ${EARLY_ACCESS_SPOTS} get in free`}
    </a>
  );
}

/** "N of 100 free spots left" beside the hero CTA. */
export function SpotsText() {
  const left = spotsLeft(useWaitlistCount());
  if (left == null) return null;
  return <span className="cta-note">{left > 0 ? `${left} of ${EARLY_ACCESS_SPOTS} free spots left` : 'Free spots are gone · waitlist open'}</span>;
}

/** Progress card in the early-access section. */
export function SpotsMeter() {
  const left = spotsLeft(useWaitlistCount());
  if (left == null) return null;
  return (
    <div className="spots">
      <div className="spots-row">
        <span className="spots-title">
          <Icon name="workspace_premium" size={18} /> Free early-access spots
        </span>
        <span className="spots-left">{left > 0 ? `${left} left` : 'All taken'}</span>
      </div>
      <div className="spots-track" aria-hidden>
        <div className="spots-fill" style={{ width: `${((EARLY_ACCESS_SPOTS - left) / EARLY_ACCESS_SPOTS) * 100}%` }} />
      </div>
    </div>
  );
}
