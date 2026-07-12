import type { Recommendation } from '../types';

export interface DeliveryApp {
  icon: string;
  name: string;
  bg: string;
  eta: string;
  fee: string;
  feeAmount: number;
  /** True for the real, matched Swiggy option — distinguishes it from the cosmetic demo apps below. */
  isLive?: boolean;
  restaurantName?: string;
  distanceKm?: number;
}

/** Demo delivery-app roster — cosmetic only, no real delivery API is integrated. Prices in ₹ to match the AI service's dish pricing. */
export const DELIVERY_APPS: DeliveryApp[] = [
  { icon: '🟠', name: 'DoorDash', bg: '#fff1f0', eta: '25-35 min', fee: '₹29 delivery', feeAmount: 29 },
  { icon: '🟢', name: 'Uber Eats', bg: '#ecfdf5', eta: '20-30 min', fee: '₹19 delivery', feeAmount: 19 },
  { icon: '🔴', name: 'Grubhub', bg: '#fef2f2', eta: '30-40 min', fee: '₹9 delivery', feeAmount: 9 },
  { icon: '🟡', name: 'Postmates', bg: '#fefce8', eta: '25-40 min', fee: 'Free delivery', feeAmount: 0 },
];

/**
 * Builds a "live" delivery option from a real Swiggy Phase 1 enrichment match — real
 * restaurant name + real ETA, as opposed to the hardcoded demo apps above. Returns null
 * when the dish had no matching open restaurant, so the caller can omit it entirely.
 */
export function swiggyDeliveryOption(rec: Recommendation): DeliveryApp | null {
  const match = rec.swiggy;
  if (!match?.matched) return null;

  const restaurantName = match.item?.restaurant_name || match.restaurant?.name;
  if (!restaurantName) return null;

  const etaMin = match.item?.eta_min ?? match.restaurant?.eta_min;

  return {
    icon: '🍽️',
    name: 'Swiggy',
    bg: '#fff3e0',
    eta: etaMin != null ? `${etaMin} min` : 'Live now',
    fee: 'Live restaurant pricing',
    feeAmount: 0,
    isLive: true,
    restaurantName,
    distanceKm: match.restaurant?.distance_km ?? undefined,
  };
}
