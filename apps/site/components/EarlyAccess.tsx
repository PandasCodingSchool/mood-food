'use client';

import { useEffect, useState } from 'react';
import { API_URL, EARLY_ACCESS_SPOTS } from '@/lib/config';

/** Real waitlist count from the API (null until loaded or if unreachable). */
export function useWaitlistCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/waitlist/count`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => typeof d?.count === 'number' && setCount(d.count))
      .catch(() => {});
  }, []);
  return [count, setCount] as const;
}

export const spotsLeft = (count: number | null) => (count == null ? null : Math.max(0, EARLY_ACCESS_SPOTS - count));

/** Hero announcement: "First 100 get free early access · N spots left". */
export function EarlyAccessPill() {
  const [count] = useWaitlistCount();
  const left = spotsLeft(count);
  return (
    <a className="announce" href="#waitlist">
      <span className="announce-dot" aria-hidden />
      {left === 0
        ? 'Early access is full — join the waitlist'
        : `First ${EARLY_ACCESS_SPOTS} sign-ups get free early access${left != null ? ` · ${left} spots left` : ''}`}
    </a>
  );
}
