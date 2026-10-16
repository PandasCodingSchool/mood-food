// The preference brain (house, insights, facts) and "Suggested for you".
// All judgement lives in the intelligence service; these calls only fetch it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recommendation, RecommendationResponse } from '../types';
import { normaliseRecommendations } from './aiRecommendations';
import { API_BASE_URL, getHeaders } from './apiBase';

export interface HouseInfo { name: string; crest: string; motto: string; about: string }
export interface HouseEvent {
  type: 'sorted' | 'shifted';
  house: string;
  from?: string;
  at: string;
  because: string[];
  membership: Record<string, number>;
}
export interface House {
  status: 'sorted' | 'unsorted';
  house: string | null;
  house_info: HouseInfo | null;
  since: string | null;
  membership: Record<string, number>;
  leaning: string;
  margin: number;
  gate: { ok: boolean; orders: number; games: number; rule: string };
  journey: HouseEvent[];
  houses?: Record<string, HouseInfo>;
}
export interface Fact { id: string; text: string; value: unknown }
export interface InsightCard { title: string; body: string; fact_ids: string[]; kind?: string }
export interface Brain {
  success: boolean;
  food: { orders: number; [k: string]: unknown };
  facts: Fact[];
  house: House | null;
  insights: { cards: InsightCard[]; method: string } | null;
  relations: Array<{ text: string }>;
}
export interface SuggestReason { kind: 'favourite' | 'usual' | 'stretch' | 'fit'; text: string; fact_ids: string[] }
export interface Suggestions {
  slot: string;
  daytype: string;
  recommendations: Recommendation[];
  reasons: Record<string, SuggestReason>;
  stretchDishId: string | null;
  liveStatus: string;
  evidenceOrders: number;
  cached: boolean;
}

const SEEN_EVENT_KEY = 'moodfood.house.seenEventAt';

export async function fetchBrain(): Promise<Brain | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/brain/me`, { headers: await getHeaders() });
    return res.ok ? ((await res.json()) as Brain) : null;
  } catch {
    return null;
  }
}

/** Brain-driven picks for right now (null → keep the mood-based hero). */
export async function fetchSuggestions(opts: { addressId?: string; refresh?: boolean } = {}): Promise<Suggestions | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/brain/me/suggest`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ ...(opts.addressId && { swiggyAddressId: opts.addressId }), ...(opts.refresh && { refresh: true }) }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const cards = normaliseRecommendations({ success: true, recommendations: data.recommendations ?? [], swiggy_matches: data.swiggy_matches } as RecommendationResponse);
    return {
      slot: data.slot,
      daytype: data.daytype,
      recommendations: cards.recommendations,
      reasons: data.reasons ?? {},
      stretchDishId: data.stretch_dish_id ?? null,
      liveStatus: data.live_status ?? 'offline',
      evidenceOrders: data.evidence?.orders ?? 0,
      cached: !!data.cached,
    };
  } catch {
    return null;
  }
}

/** Throttled server-side (6 h): picks up new Swiggy / Instamart orders while they're still visible. */
export async function refreshHistory(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/swiggy/oauth/history/refresh`, { method: 'POST', headers: await getHeaders() });
  } catch {
    // best-effort
  }
}

/** The newest sorting / shift the user hasn't seen the reveal for, if any. */
export async function unseenHouseEvent(house: House | null | undefined): Promise<HouseEvent | null> {
  const latest = house?.journey?.[house.journey.length - 1];
  if (!latest || house?.status !== 'sorted') return null;
  try {
    const seen = await AsyncStorage.getItem(SEEN_EVENT_KEY);
    return seen && seen >= latest.at ? null : latest;
  } catch {
    return null;
  }
}

export async function markHouseEventSeen(event: HouseEvent): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_EVENT_KEY, event.at);
  } catch {
    // best-effort
  }
}
