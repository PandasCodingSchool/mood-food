import { Linking } from 'react-native';
import { API_BASE_URL, getHeaders } from './apiBase';
import type { Recommendation, EnrichResponse, EnrichedMatch } from '../types';

/**
 * Enrich recommendations with real Swiggy matches (photo, price, ETA, live status).
 * Mirrors frontend/src/services/swiggy.ts — same backend proxy, same request shape.
 * Returns a map keyed by dish id for easy lookup; resolves to {} on any failure
 * so callers can always fall back to the AI-generated placeholder image.
 */
export async function enrichRecommendations(
  recommendations: Recommendation[],
  addressId?: string,
): Promise<Record<string, EnrichedMatch>> {
  const dishes = recommendations
    .filter((r) => r.dish?.name)
    .map((r) => ({
      id: r.dish?.id || r.id,
      name: r.dish.name,
      cuisine: r.dish.cuisine,
    }));

  if (dishes.length === 0) return {};

  const response = await fetch(`${API_BASE_URL}/swiggy/enrich`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ dishes, address_id: addressId || undefined }),
  });

  if (!response.ok) {
    throw new Error(`Swiggy enrich failed: ${response.status}`);
  }

  const data = (await response.json()) as EnrichResponse;
  if (!data.success) {
    throw new Error(data.error || 'Swiggy enrich unsuccessful');
  }

  const byDish: Record<string, EnrichedMatch> = {};
  for (const m of data.matches) {
    if (m.matched) byDish[m.dish_id] = m;
  }
  return byDish;
}

export async function swiggyStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch(`${API_BASE_URL}/swiggy/status`, { headers: await getHeaders() });
    if (!res.ok) return { configured: false };
    return (await res.json()) as { configured: boolean };
  } catch {
    return { configured: false };
  }
}

/** Bounds a promise to a max wait, resolving to `fallback` on timeout instead of rejecting the caller. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

/**
 * Open the Swiggy app (or website) at a specific restaurant page.
 * Uses Android App Links / iOS Universal Links — if Swiggy is installed the OS
 * hands off to the native app directly; otherwise the browser opens as fallback.
 */
export async function openSwiggyApp(restaurantId?: string | null, dishName?: string): Promise<void> {
  const base = restaurantId
    ? `https://www.swiggy.com/restaurants/${restaurantId}`
    : `https://www.swiggy.com/search?query=${encodeURIComponent(dishName || '')}`;
  await Linking.openURL(base);
}

/** Initiate Swiggy OAuth — returns the authUrl to open in the browser. */
export async function initiateSwiggyOAuth(headers: Record<string, string>): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/swiggy/oauth/initiate`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) throw new Error('Failed to start Swiggy connection');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'OAuth initiation failed');
  return data.authUrl as string;
}

/** Unlink Swiggy account from MoodFood. */
export async function unlinkSwiggy(headers: Record<string, string>): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/swiggy/oauth/unlink`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) throw new Error('Failed to unlink Swiggy');
}
