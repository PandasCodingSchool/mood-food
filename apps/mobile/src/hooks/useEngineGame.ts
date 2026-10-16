import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveMood } from '../context/LiveMood';
import { answerGame, startGame, type Decision, type EngineGame, type Progress, type Question } from '../services/engineGames';
import { trackEvent } from '../utils/analytics';

/** One engine game session: the current question, progress, and the decision when it ends. */
export function useEngineGame(game: EngineGame) {
  const { mood } = useLiveMood();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownAt = useRef(Date.now());

  const reset = useCallback(async () => {
    setError(null);
    setDecision(null);
    setQuestion(null);
    setBusy(true);
    try {
      const t = await startGame(game, mood);
      setSessionId(t.sessionId);
      setQuestion(t.question);
      setProgress(t.progress);
      shownAt.current = Date.now();
      trackEvent('game_started', { game, engine: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the game');
    } finally {
      setBusy(false);
    }
  }, [game, mood]);

  useEffect(() => {
    void reset();
  }, [reset]);

  const answer = useCallback(
    async (value: Record<string, unknown>) => {
      if (!sessionId || busy || decision) return;
      setBusy(true);
      try {
        const t = await answerGame(sessionId, value, Date.now() - shownAt.current);
        setProgress(t.progress);
        if (t.done) {
          setDecision(t.decision);
          setQuestion(null);
          trackEvent('game_completed', { game, engine: true, steps: t.progress?.step });
        } else {
          setQuestion(t.question);
          shownAt.current = Date.now();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not send your answer');
      } finally {
        setBusy(false);
      }
    },
    [sessionId, busy, decision, game],
  );

  return { question, progress, decision, busy, error, answer, reset, loading: busy && !question && !decision };
}
