import type { Recommendation } from '../types';
import { resolveDishImage } from './dishVisuals';

/** Display fields for a recommendation, preferring live Swiggy data. */
export interface RecView {
  id: string;
  name: string;
  cuisine: string;
  restaurantName: string | null;
  restaurantId: string | null;
  menuItemId: string | null;
  /** True when a live Swiggy menu item is matched (orderable in-app). */
  live: boolean;
  isOpen: boolean | null;
  imageUrl: string | null;
  /** Rounded match %, only when the API returned a confidence. */
  match: number | null;
  price: number | null;
  priceTxt: string | null;
  eta: number | null;
  rating: number | null;
  distanceKm: number | null;
  health: number | null;
  kcal: number | null;
  prepMin: number | null;
  why: string | null;
  tags: string[];
}

export function recView(rec: Recommendation): RecView {
  const live = rec.swiggy?.matched ? rec.swiggy : null;
  const price = live?.item?.price ?? rec.practical_details?.estimated_price ?? null;
  const eta =
    live?.item?.eta_min ?? live?.restaurant?.eta_min ?? rec.restaurant?.delivery_time_min ?? null;
  return {
    id: rec.id,
    name: rec.dish.name,
    cuisine: rec.dish.cuisine,
    restaurantName: live?.item?.restaurant_name || live?.restaurant?.name || rec.restaurant?.name || null,
    restaurantId: live?.item?.restaurant_id ?? live?.restaurant?.id ?? null,
    menuItemId: live?.item?.id ?? null,
    live: !!(live?.item?.id && (live.item.restaurant_id || live.restaurant?.id)),
    isOpen: live?.restaurant?.is_open ?? rec.restaurant?.is_open ?? null,
    imageUrl: resolveDishImage(rec),
    match: rec.confidence != null ? Math.round(rec.confidence * 100) : null,
    price,
    priceTxt: price != null ? `₹${Math.round(price)}` : null,
    eta,
    rating: live?.item?.rating ?? live?.restaurant?.rating ?? rec.restaurant?.rating ?? null,
    distanceKm: live?.restaurant?.distance_km ?? rec.restaurant?.distance_km ?? null,
    health: rec.practical_details?.health_score ?? null,
    kcal: rec.practical_details?.calories ?? null,
    prepMin: rec.practical_details?.preparation_time ?? null,
    why: rec.ai_reasoning?.mood_match || rec.ai_reasoning?.context_fit || null,
    tags: rec.dish.tags ?? rec.ai_reasoning?.context_tags ?? [],
  };
}

/** "Kesar Da Dhaba · 32 min · ₹420", skipping unknown parts. */
export function metaLine(v: RecView, parts: Array<'restaurant' | 'cuisine' | 'eta' | 'price'> = ['restaurant', 'eta', 'price']): string {
  return parts
    .map((p) =>
      p === 'restaurant' ? v.restaurantName : p === 'cuisine' ? v.cuisine : p === 'eta' ? (v.eta != null ? `${v.eta} min` : null) : v.priceTxt,
    )
    .filter(Boolean)
    .join(' · ');
}

/** Short caption for the striped placeholder when there's no photo. */
export function imageCaption(v: RecView): string {
  return v.name.toLowerCase().split(/[&,(]/)[0].trim();
}
