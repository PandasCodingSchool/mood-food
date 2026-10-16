'use client';

import { useEffect, useState } from 'react';

const format = (d: Date, withPeriod: boolean) => {
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return withPeriod ? t : t.replace(/\s?[AP]M$/i, '');
};

/**
 * The visitor's current time, ticking on the minute. Renders nothing on the
 * server (the build has no idea what time it is for the visitor) and fills in
 * on mount, so there is no hydration mismatch.
 */
export function LiveClock({ period = true }: { period?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    let interval: ReturnType<typeof setInterval> | undefined;
    // Align ticks to the minute boundary, then tick every minute.
    const first = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <time dateTime={now?.toISOString()} suppressHydrationWarning>
      {now ? format(now, period) : ' '}
    </time>
  );
}
