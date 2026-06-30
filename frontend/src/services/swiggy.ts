import type { Recommendation } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

/**
 * Phase 1 discovery is gated behind a build flag so the app safely degrades to
 * the existing deep-link behaviour when the Swiggy integration isn't live.
 */
export function isSwiggyLive(): boolean {
  return import.meta.env.VITE_SWIGGY_LIVE === "true";
}

/** Cities we have a saved bootstrap-account address for (mirrors backend map). */
export const SWIGGY_CITIES = [
  "Bangalore",
  "Mumbai",
  "Delhi",
  "Hyderabad",
  "Pune",
  "Chennai",
] as const;

const CITY_STORAGE_KEY = "moodfood.swiggy.city";

export function getSavedCity(): string {
  return localStorage.getItem(CITY_STORAGE_KEY) || "";
}

export function saveCity(city: string): void {
  localStorage.setItem(CITY_STORAGE_KEY, city);
}

export interface SwiggyMenuItem {
  id: string;
  name: string;
  price?: number | null;
  image_url?: string | null;
  is_veg?: boolean | null;
  rating?: number | null;
  restaurant_id?: string | null;
  restaurant_name?: string | null;
  eta_min?: number | null;
}

export interface SwiggyRestaurant {
  id: string;
  name: string;
  rating?: number | null;
  eta_min?: number | null;
  distance_km?: number | null;
  cuisines?: string[];
  image_url?: string | null;
  is_open?: boolean;
  cost_for_two?: number | null;
}

export interface EnrichedMatch {
  dish_id: string;
  matched: boolean;
  item?: SwiggyMenuItem | null;
  restaurant?: SwiggyRestaurant | null;
}

export interface EnrichResponse {
  success: boolean;
  address_id?: string | null;
  matches: EnrichedMatch[];
  error?: string;
}

/**
 * Enrich recommendations with real Swiggy matches (price / rating / ETA).
 * Returns a map keyed by dish id for easy lookup in the UI.
 */
export async function enrichRecommendations(
  recommendations: Recommendation[],
  city: string,
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dishes, city }),
  });

  if (!response.ok) {
    throw new Error(`Swiggy enrich failed: ${response.status}`);
  }

  const data = (await response.json()) as EnrichResponse;
  if (!data.success) {
    throw new Error(data.error || "Swiggy enrich unsuccessful");
  }

  const byDish: Record<string, EnrichedMatch> = {};
  for (const m of data.matches) {
    if (m.matched) byDish[m.dish_id] = m;
  }
  return byDish;
}

export async function swiggyStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch(`${API_BASE_URL}/swiggy/status`);
    if (!res.ok) return { configured: false };
    return (await res.json()) as { configured: boolean };
  } catch {
    return { configured: false };
  }
}
