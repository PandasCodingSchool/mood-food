// Server-driven games: the intelligence engine picks every question, decides
// when to stop and returns the decision (live Swiggy cards when an address is
// known). Game signals are logged by the API, so screens don't log them.
import type { Mood } from '@moodfood/tokens';
import type { RecommendationResponse } from '../types';
import { buildRequestContext, normaliseRecommendations } from './aiRecommendations';
import { API_BASE_URL, getHeaders } from './apiBase';
import { moodQuery, resolveAddressId } from './moodRecs';
import { fetchPreferences } from './preferences';

export type EngineGame = 'swipe' | 'this_or_that' | 'craving_radar' | 'story' | 'bracket' | 'roulette';

export interface DishCard { id: string; name: string; cuisine: string; image_url: string | null; tags: string[]; veg: boolean; stretch?: boolean }
export interface Question {
  key: string;
  kind: 'swipe' | 'duel' | 'yes_no' | 'choice' | 'spin';
  // swipe
  dish?: DishCard;
  // duel / bracket
  options?: Array<DishCard & { label?: string; emoji?: string }>;
  round?: string;
  match?: number;
  matches?: number;
  // craving radar
  tag?: string;
  // story
  prompt?: string;
  base_prompt?: string;
  personalised?: boolean;
  segment?: string;
  cold_open?: string;
  step?: number;
  of?: number;
  // roulette
  segments?: DishCard[];
  landed?: DishCard;
  spin?: number;
  spins_left?: number;
}
export interface Progress { step: number; min_steps: number; max_steps: number; leader_probability: number }
export interface Decision { dishIds: string[]; confidence: number; liveStatus: string; recommendations: RecommendationResponse }
export interface Turn { sessionId: string; question: Question | null; progress: Progress; done: boolean; decision: Decision | null }

async function post(path: string, body: unknown) {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: await getHeaders(), body: JSON.stringify(body) });
  if (res.status === 429) throw new Error('Too many games at once. Give it a minute.');
  if (!res.ok) throw new Error(`Game unavailable (${res.status})`);
  return res.json();
}

function turn(data: Record<string, any>): Turn {
  const d = data.decision;
  return {
    sessionId: data.session_id,
    question: data.question ?? null,
    progress: data.progress,
    done: !!data.done,
    decision: d ? { dishIds: d.dish_ids, confidence: d.confidence, liveStatus: d.live_status, recommendations: normaliseRecommendations(d.recommendations) } : null,
  };
}

export async function startGame(game: EngineGame, mood: Mood): Promise<Turn> {
  const prefs = await fetchPreferences().catch(() => null);
  const context = await buildRequestContext(moodQuery(mood), null, false, prefs);
  const addressId = await resolveAddressId().catch(() => undefined);
  return turn(await post('/games/session', { ...context, game, ...(addressId && { swiggy_address_id: addressId }) }));
}

export async function answerGame(sessionId: string, answer: Record<string, unknown>, reactionMs?: number): Promise<Turn> {
  return turn(await post(`/games/session/${encodeURIComponent(sessionId)}/answer`, { answer, ...(reactionMs != null && { reactionMs }) }));
}
