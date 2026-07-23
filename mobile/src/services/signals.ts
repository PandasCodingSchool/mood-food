import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, getHeaders } from './apiBase';
import type { LearnedProfile, PendingPrediction, SignalEvent } from '../types';

// Offline-tolerant transport for the personalization signals spine.
// Signals queue locally and flush in batches; a failed flush re-queues, and
// the backend log is append-only so duplicates are the only risk we avoid
// by removing from the queue before posting.

const QUEUE_KEY = 'moodfood_signal_queue';
const MAX_BATCH = 50;

let memoryQueue: SignalEvent[] = [];
let hydrated = false;
let flushing = false;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (raw) {
      memoryQueue = [...JSON.parse(raw), ...memoryQueue];
    }
  } catch {
    // best-effort — a lost queue only loses training data, never app state
  }
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(memoryQueue));
  } catch {
    // ignore
  }
}

/** Queue one signal and trigger a flush. */
export async function logSignal(
  type: string,
  payload: Record<string, unknown>,
  context?: Record<string, unknown>,
): Promise<void> {
  await logSignals([{ type, payload, context, clientTs: new Date().toISOString() }]);
}

/** Queue a batch of signals and trigger a flush. */
export async function logSignals(signals: SignalEvent[]): Promise<void> {
  await hydrate();
  memoryQueue.push(...signals);
  await persist();
  void flushSignals();
}

/** Attempt to send everything queued. Safe to call anytime (e.g. on foreground). */
export async function flushSignals(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await hydrate();
    while (memoryQueue.length > 0) {
      const batch = memoryQueue.slice(0, MAX_BATCH);
      const headers = await getHeaders();
      const response = await fetch(`${API_BASE_URL}/signals`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ signals: batch }),
      });
      if (!response.ok) return; // keep queued; retry on next flush
      memoryQueue = memoryQueue.slice(batch.length);
      await persist();
    }
  } catch {
    // offline — queue survives for the next flush
  } finally {
    flushing = false;
  }
}

/** Learned profile: persona, confidence, question budget, game plan. */
export async function fetchLearnedProfile(): Promise<LearnedProfile | null> {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/signals/profile`, { headers });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.profile ?? null;
  } catch {
    return null;
  }
}

/** Unresolved predictions old enough for the post-meal prompt (4.1). */
export async function fetchPendingPredictions(): Promise<PendingPrediction[]> {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/predictions/pending`, { headers });
    if (!response.ok) return [];
    const data = await response.json();
    return data?.pending ?? [];
  } catch {
    return [];
  }
}

/** Twin taste (3.7): dishes loved by taste neighbours, unseen by this user. */
export async function fetchTwinTaste(): Promise<{ neighborCount: number; dishes: Array<{ dishId: string; dishName: string; lovedBy: number }> }> {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/signals/twin-taste`, { headers });
    if (!response.ok) return { neighborCount: 0, dishes: [] };
    const data = await response.json();
    return {
      neighborCount: data?.neighbor_count ?? 0,
      dishes: (data?.dishes ?? []).map((d: { dish_id: string; dish_name: string; loved_by: number }) => ({
        dishId: d.dish_id,
        dishName: d.dish_name,
        lovedBy: d.loved_by,
      })),
    };
  } catch {
    return { neighborCount: 0, dishes: [] };
  }
}

/** Resolve a prediction: post-meal score (1-5) or a blind-bet star rating. */
export async function resolvePrediction(
  predictionId: string,
  outcome: { actualScore?: number; userPredictedScore?: number },
): Promise<boolean> {
  try {
    const headers = await getHeaders();
    const response = await fetch(
      `${API_BASE_URL}/predictions/${encodeURIComponent(predictionId)}/resolve`,
      { method: 'POST', headers, body: JSON.stringify(outcome) },
    );
    return response.ok;
  } catch {
    return false;
  }
}
