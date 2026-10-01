import type { useRouter } from 'expo-router';
import type { Recommendation } from '../types';
import { recView } from '../utils/recView';
import { getSavedAddressId } from './aiRecommendations';

type Router = ReturnType<typeof useRouter>;

/** Opens the meal detail for a recommendation (same params v1 used). */
export function openMeal(router: Router, rec: Recommendation, rank: number) {
  router.push({ pathname: '/meal-detail', params: { rec: JSON.stringify(rec), rank: String(rank) } });
}

/**
 * "Order now": a live Swiggy match goes in-app (restaurant menu with this
 * dish pre-added, then checkout). Anything else falls back to v1's delivery
 * app picker.
 */
export async function startOrder(router: Router, rec: Recommendation, rank: number) {
  const v = recView(rec);
  const addressId = v.live ? await getSavedAddressId() : null;
  if (v.live && addressId && v.restaurantId) {
    router.push({
      pathname: '/restaurant-menu',
      params: {
        restaurantId: v.restaurantId,
        addressId,
        restaurantName: v.restaurantName || '',
        dishId: rec.dish.id || '',
        dishName: rec.dish.name,
        why: rec.ai_reasoning?.mood_match || '',
        initialMenuItemId: v.menuItemId || '',
        addInitial: '1',
      },
    });
    return;
  }
  router.push({ pathname: '/order/app-select', params: { rec: JSON.stringify(rec), rank: String(rank) } });
}
