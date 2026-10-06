import { useCallback, useState } from 'react';
import type { useRouter } from 'expo-router';
import type { Recommendation } from '../types';
import { recView } from '../utils/recView';
import { fetchAddresses, getSavedAddressId, saveAddressId } from './aiRecommendations';
import { fetchCurrentUser } from './auth';
import { openSwiggyApp } from './swiggy';
import { searchMenu } from './swiggyOrder';

type Router = ReturnType<typeof useRouter>;

/** Opens the meal detail for a recommendation (same params v1 used). */
export function openMeal(router: Router, rec: Recommendation, rank: number) {
  router.push({ pathname: '/meal-detail', params: { rec: JSON.stringify(rec), rank: String(rank) } });
}

/** Saved Swiggy address, else the account's first one (remembered for next time). */
async function resolveAddressId(): Promise<string | null> {
  const saved = await getSavedAddressId();
  if (saved) return saved;
  const [first] = await fetchAddresses();
  if (!first) return null;
  await saveAddressId(first.id);
  return first.id;
}

/**
 * "Order now" always goes to Swiggy:
 * 1. not linked → connect Swiggy first;
 * 2. live match on the recommendation → that restaurant's menu, dish pre-added;
 * 3. otherwise search Swiggy's menus near the user for the dish and open the best hit;
 * 4. no address or no hit → hand off to Swiggy's own search (app or web).
 */
async function startOrder(router: Router, rec: Recommendation) {
  const user = await fetchCurrentUser();
  if (!user?.swiggyLinked) {
    router.push('/swiggy-connect');
    return;
  }
  const addressId = await resolveAddressId();
  if (!addressId) return openSwiggyApp(null, rec.dish.name);

  const v = recView(rec);
  let target = v.live && v.restaurantId ? { restaurantId: v.restaurantId, restaurantName: v.restaurantName || '', menuItemId: v.menuItemId || '' } : null;
  if (!target) {
    const [hit] = await searchMenu(rec.dish.name, addressId);
    if (hit) target = { restaurantId: hit.restaurantId, restaurantName: hit.restaurantName || '', menuItemId: hit.id };
  }
  if (!target) return openSwiggyApp(null, rec.dish.name);

  router.push({
    pathname: '/restaurant-menu',
    params: {
      restaurantId: target.restaurantId,
      addressId,
      restaurantName: target.restaurantName,
      dishId: rec.dish.id || '',
      dishName: rec.dish.name,
      why: rec.ai_reasoning?.mood_match || '',
      initialMenuItemId: target.menuItemId,
      addInitial: target.menuItemId ? '1' : '',
    },
  });
}

/** `order(rec)` for an "Order now" button, plus a busy flag while Swiggy is searched. */
export function useStartOrder(router: Router) {
  const [ordering, setOrdering] = useState(false);
  const order = useCallback(
    async (rec: Recommendation) => {
      if (ordering) return;
      setOrdering(true);
      try {
        await startOrder(router, rec);
      } finally {
        setOrdering(false);
      }
    },
    [router, ordering],
  );
  return { order, ordering };
}
