import AsyncStorage from '@react-native-async-storage/async-storage';

// The most recent real (Swiggy) order, so home can show the live banner and
// /order/track can show items/total. Saved by checkout, updated by tracking.

export type TrackStep = 'placed' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled';

export interface TrackEvent {
  step: TrackStep;
  /** Raw status text from Swiggy, when there is one. */
  status?: string | null;
  at: string;
}

export interface ActiveOrder {
  orderId: string;
  restaurant: string;
  dishId?: string | null;
  dishName?: string | null;
  items: Array<{ label: string; total: string }>;
  total: string;
  /** ETA text at placement (e.g. "30-40 min"). */
  eta?: string | null;
  placedAt: string;
  step: TrackStep;
  liveEta?: string | null;
  events: TrackEvent[];
}

const KEY = 'moodfood.activeOrder';

export async function getActiveOrder(): Promise<ActiveOrder | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveOrder) : null;
  } catch {
    return null;
  }
}

export async function saveActiveOrder(order: ActiveOrder): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // best-effort
  }
}

export async function clearActiveOrder(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

export const isTerminal = (s: TrackStep) => s === 'delivered' || s === 'cancelled';

/** Same mapping v1's order success screen used for Swiggy statuses. */
export function stepFromStatus(status: string | null | undefined): TrackStep {
  const s = (status || '').toLowerCase();
  if (s.includes('cancel') || s.includes('fail')) return 'cancelled';
  if (s.includes('deliver') && !s.includes('out')) return 'delivered';
  if (s.includes('way') || s.includes('transit') || s.includes('pickup') || s.includes('rider')) return 'on_the_way';
  if (s.includes('prepar') || s.includes('confirm') || s.includes('accept') || s.includes('placed')) return 'preparing';
  return 'placed';
}
