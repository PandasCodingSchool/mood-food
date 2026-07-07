import type { Recommendation } from "../types";
import { getSessionHeaders } from "../utils/session";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...getSessionHeaders(),
    ...extra,
  };
}

/**
 * Phase 1 discovery is gated behind a build flag so the app safely degrades to
 * the existing deep-link behaviour when the Swiggy integration isn't live.
 */
export function isSwiggyLive(): boolean {
  return import.meta.env.VITE_SWIGGY_LIVE === "true";
}

export interface SwiggyAddress {
  id: string;
  label: string;
  line: string;
}

const ADDRESS_STORAGE_KEY = "moodfood.swiggy.addressId";

export function getSavedAddressId(): string {
  return localStorage.getItem(ADDRESS_STORAGE_KEY) || "";
}

export function saveAddressId(id: string): void {
  localStorage.setItem(ADDRESS_STORAGE_KEY, id);
}

/** The connected account's saved delivery addresses (drives the picker). */
export async function fetchAddresses(): Promise<SwiggyAddress[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/swiggy/addresses`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.success ? (data.addresses as SwiggyAddress[]) : [];
  } catch {
    return [];
  }
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
  swiggy_alternatives?: SwiggyAlt[];
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
export interface SwiggyAlt {
  type: "healthier" | "budget";
  item: SwiggyMenuItem;
}

export async function enrichRecommendations(
  recommendations: Recommendation[],
  addressId: string,
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
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ dishes, address_id: addressId || undefined }),
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
    const res = await fetch(`${API_BASE_URL}/swiggy/status`, {
      headers: headers(),
    });
    if (!res.ok) return { configured: false };
    return (await res.json()) as { configured: boolean };
  } catch {
    return { configured: false };
  }
}

export interface MoodFoodUser {
  id: string;
  sessionId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  swiggyLinked: boolean;
  swiggyUserId: string | null;
  swiggyExpiresAt: string | null;
}

export async function fetchUser(): Promise<MoodFoodUser | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/user/me`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? (data.user as MoodFoodUser) : null;
  } catch {
    return null;
  }
}

export async function initiateSwiggyOAuth(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/swiggy/oauth/initiate`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.authUrl : null;
  } catch {
    return null;
  }
}

export async function unlinkSwiggyOAuth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/swiggy/oauth/unlink`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    return res.ok;
  } catch {
    return false;
  }
}
