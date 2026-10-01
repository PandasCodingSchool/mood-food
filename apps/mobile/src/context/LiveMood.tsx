import { createContext, useContext, type ReactNode } from 'react';
import { MoodThemeProvider, ToastProvider } from '@moodfood/ui';
import { useLiveMoodContext, type LiveMoodContext } from '../hooks/useLiveMoodContext';

const LiveMoodCtx = createContext<LiveMoodContext | null>(null);

/**
 * App-wide 2.0 theme: real clock, local weather and today's check-in drive
 * the @moodfood/ui theme for every screen built on the design system.
 */
export function LiveMoodProvider({ children }: { children: ReactNode }) {
  const live = useLiveMoodContext();
  return (
    <LiveMoodCtx.Provider value={live}>
      <MoodThemeProvider time={live.time} weather={live.weather} mood={live.mood}>
        <ToastProvider>{children}</ToastProvider>
      </MoodThemeProvider>
    </LiveMoodCtx.Provider>
  );
}

export function useLiveMood(): LiveMoodContext {
  const ctx = useContext(LiveMoodCtx);
  if (!ctx) throw new Error('useLiveMood must be used inside <LiveMoodProvider>');
  return ctx;
}
