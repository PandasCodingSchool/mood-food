import type { Mood } from '@moodfood/tokens';
import type { QuizResults, Recommendation, RecommendationResponse } from '../types';
import {
  fetchAddresses,
  fetchRecommendations,
  getSavedAddressId,
  isSwiggyLive,
  saveAddressId,
  saveLastRecommendation,
} from './aiRecommendations';
import { enrichAlternatives, enrichRecommendations } from './swiggy';

// Home and "Your matches" show the same mood-driven picks. One cached request
// per (day, mood) keeps us well inside the API rate limit (it returns 429).

let cache: { key: string; res: RecommendationResponse } | null = null;
let inflight: { key: string; promise: Promise<RecommendationResponse> } | null = null;
const listeners = new Set<(res: RecommendationResponse) => void>();

/**
 * QuizResults for the no-game path, same shape Mind Reader uses. Energy,
 * stress, hunger and company come from today's check-in inside
 * fetchRecommendations, so only the derived mood is needed here.
 */
export function moodQuery(mood: Mood): QuizResults {
  return { mood, craving: 'comfort', budget: 'medium', preference: 'both' };
}

export async function resolveAddressId(): Promise<string | undefined> {
  let addressId = await getSavedAddressId();
  if (isSwiggyLive() && !addressId) {
    const addresses = await fetchAddresses();
    if (addresses.length > 0) {
      addressId = addresses[0].id;
      await saveAddressId(addressId);
    }
  }
  return addressId || undefined;
}

/** Healthier/budget swaps are matched in the background so they never delay first paint. */
function streamAlternatives(res: RecommendationResponse, addressId: string, key: string) {
  enrichAlternatives(res.recommendations, addressId).then((matches) => {
    if (matches.length === 0 || cache?.key !== key) return;
    const patched: RecommendationResponse = {
      ...cache.res,
      recommendations: cache.res.recommendations.map((rec) =>
        rec.alternatives
          ? {
              ...rec,
              alternatives: rec.alternatives.map((alt) => {
                const m = matches.find((x) => x.rec_id === rec.id && x.dish_id === alt.dish_id);
                return m ? { ...alt, swiggy: m.match } : alt;
              }),
            }
          : rec,
      ),
    };
    cache = { key, res: patched };
    listeners.forEach((l) => l(patched));
  });
}

async function load(query: QuizResults, refresh: boolean): Promise<RecommendationResponse> {
  const addressId = await resolveAddressId();
  let res = await fetchRecommendations(query, null, refresh, addressId);
  // If the backend didn't embed live matches, attach them directly.
  const hasLive = res.swiggy_matches && Object.keys(res.swiggy_matches).length > 0;
  if (isSwiggyLive() && addressId && !hasLive && res.recommendations.length > 0) {
    try {
      const enriched = await enrichRecommendations(res.recommendations, addressId);
      if (Object.keys(enriched).length > 0) {
        res = {
          ...res,
          live_status: 'partial',
          swiggy_matches: enriched,
          recommendations: res.recommendations.map((r) => ({ ...r, swiggy: enriched[r.dish?.id || r.id] ?? r.swiggy })),
        };
      }
    } catch {
      // keep the un-enriched response
    }
  }
  if (res.recommendations[0]) void saveLastRecommendation(res.recommendations[0]);
  return Object.assign(res, { _addressId: addressId });
}

export async function getMoodRecommendations(
  mood: Mood,
  opts: { refresh?: boolean; query?: QuizResults } = {},
): Promise<RecommendationResponse> {
  const query = opts.query ?? moodQuery(mood);
  const key = `${new Date().toDateString()}|${JSON.stringify(query)}`;
  if (!opts.refresh && cache?.key === key) return cache.res;
  if (!opts.refresh && inflight?.key === key) return inflight.promise;
  const promise = load(query, !!opts.refresh).then((res) => {
    cache = { key, res };
    const addressId = (res as RecommendationResponse & { _addressId?: string })._addressId;
    if (isSwiggyLive() && addressId) streamAlternatives(res, addressId, key);
    return res;
  });
  inflight = { key, promise };
  try {
    return await promise;
  } finally {
    if (inflight?.promise === promise) inflight = null;
  }
}

/** Subscribe to background updates (alternative matches arriving). */
export function onRecommendationsUpdate(fn: (res: RecommendationResponse) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function findCachedRecommendation(id: string): Recommendation | undefined {
  return cache?.res.recommendations.find((r) => r.id === id);
}
