import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { API_BASE_URL } from '../../services/apiBase';

export type SpeechPart = 'ingredients' | 'step';
export interface Reading { date: string; part: SpeechPart; index: number; steps: number; continuous: boolean }
/** Asks the server for one spoken part of a day; returns its audio path (e.g. /kitchen-circle/speech/<key>). */
export type SpeakFn = (date: string, part: SpeechPart, index: number) => Promise<string>;

/**
 * One player for the cook view's read-aloud. `play` reads one part; with `continuous`, steps carry on to the next
 * until the last one (or Stop). Audio comes from cached server clips, so a repeat listen is instant.
 */
export function useReadAloud(speak: SpeakFn) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const current = useRef<Reading | null>(null);

  const release = () => {
    try { player.current?.pause(); player.current?.remove(); } catch { /* already gone */ }
    player.current = null;
  };

  const stop = useCallback(() => { release(); current.current = null; setReading(null); setLoading(false); }, []);

  const play = useCallback(async (next: Reading) => {
    release();
    current.current = next; setReading(next); setError(null); setLoading(true);
    try {
      const path = await speak(next.date, next.part, next.index);
      if (current.current !== next) return; // stopped or replaced while loading
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
      const p = createAudioPlayer({ uri: `${API_BASE_URL}${path}` });
      player.current = p;
      p.addListener('playbackStatusUpdate', (status) => {
        if (!status.didJustFinish || current.current !== next) return;
        if (next.continuous && next.part === 'step' && next.index + 1 < next.steps) void play({ ...next, index: next.index + 1 });
        else stop();
      });
      p.play();
      // Reading straight through: get the next step ready while this one plays (the server caches it), so there's no gap.
      if (next.continuous && next.part === 'step' && next.index + 1 < next.steps) void speak(next.date, 'step', next.index + 1).catch(() => undefined);
    } catch (err) {
      if (current.current === next) { setError(err instanceof Error ? err.message : 'Read-aloud isn’t available right now.'); setReading(null); }
    } finally {
      if (current.current === next) setLoading(false);
    }
  }, [speak, stop]);

  useEffect(() => () => release(), []);
  return { reading, loading, error, play, stop };
}
