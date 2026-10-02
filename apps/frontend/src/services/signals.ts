import type { LearnedProfile, PendingPrediction, SignalEvent } from "../types";
import { getSessionId } from "../utils/session";

// Transport for the personalization signals spine (POST /api/signals).
// Signals batch in memory and flush quickly; on page unload the remainder
// goes out via sendBeacon so short sessions still train the model.

const API_URL = import.meta.env.VITE_API_URL || "/api";
const FLUSH_DELAY_MS = 2000;
const MAX_BATCH = 50;

let queue: SignalEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const sessionId = getSessionId();
  if (sessionId) h["x-session-id"] = sessionId;
  return h;
}

export function logSignal(
  type: string,
  payload: Record<string, unknown>,
  context?: Record<string, unknown>,
): void {
  queue.push({ type, payload, context, clientTs: new Date().toISOString() });
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flushSignals(), FLUSH_DELAY_MS);
}

export async function flushSignals(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  while (queue.length > 0) {
    const batch = queue.slice(0, MAX_BATCH);
    try {
      const response = await fetch(`${API_URL}/signals`, {
        method: "POST",
        headers: headers(),
        credentials: "include",
        body: JSON.stringify({ signals: batch }),
      });
      if (!response.ok) return; // keep queued; retry on next flush
      queue = queue.slice(batch.length);
    } catch {
      return; // offline — retry later
    }
  }
}

// Last-chance flush when the tab closes.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (queue.length === 0) return;
    try {
      navigator.sendBeacon(
        `${API_URL}/signals`,
        new Blob([JSON.stringify({ signals: queue })], { type: "application/json" }),
      );
      queue = [];
    } catch {
      // best-effort
    }
  });
}

export async function fetchLearnedProfile(): Promise<LearnedProfile | null> {
  try {
    const response = await fetch(`${API_URL}/signals/profile`, {
      headers: headers(),
      credentials: "include",
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.profile ?? null;
  } catch {
    return null;
  }
}

export async function fetchPendingPredictions(): Promise<PendingPrediction[]> {
  try {
    const response = await fetch(`${API_URL}/predictions/pending`, {
      headers: headers(),
      credentials: "include",
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data?.pending ?? [];
  } catch {
    return [];
  }
}

export async function fetchTwinTaste(): Promise<{
  neighborCount: number;
  dishes: Array<{ dishId: string; dishName: string; lovedBy: number }>;
}> {
  try {
    const response = await fetch(`${API_URL}/signals/twin-taste`, {
      headers: headers(),
      credentials: "include",
    });
    if (!response.ok) return { neighborCount: 0, dishes: [] };
    const data = await response.json();
    return {
      neighborCount: data?.neighbor_count ?? 0,
      dishes: (data?.dishes ?? []).map(
        (d: { dish_id: string; dish_name: string; loved_by: number }) => ({
          dishId: d.dish_id,
          dishName: d.dish_name,
          lovedBy: d.loved_by,
        }),
      ),
    };
  } catch {
    return { neighborCount: 0, dishes: [] };
  }
}

export async function resolvePrediction(
  predictionId: string,
  outcome: { actualScore?: number; userPredictedScore?: number },
): Promise<boolean> {
  try {
    const response = await fetch(
      `${API_URL}/predictions/${encodeURIComponent(predictionId)}/resolve`,
      {
        method: "POST",
        headers: headers(),
        credentials: "include",
        body: JSON.stringify(outcome),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
