import { getSessionHeaders } from "../utils/session";
import type { Ingredient, MatchedIngredient } from "./instamart";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

function headers(): Record<string, string> {
  return { ...getSessionHeaders(), "Content-Type": "application/json" };
}

export interface Recipe {
  dish: string;
  servings: number;
  items: Ingredient[];
  steps: string[];
}

export interface DiySession {
  id: string;
  dishName: string;
  recipe: Recipe;
  ingredientCart: MatchedIngredient[];
  matchedProducts: MatchedIngredient[];
  completedSteps: number[];
  instamartOrderId?: string | null;
  status: "cart" | "checked_out" | "cooking" | "done";
  wallPhotoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function generateRecipe(
  dish: string,
  servings = 2,
): Promise<{ success: boolean; recipe?: Recipe; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/recipe/generate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ dish, servings }),
  });
  const data = await res.json();
  return { success: !!data.success, recipe: data.recipe, error: data.error };
}

function mapSession(r: Record<string, unknown>): DiySession {
  return {
    id: r.id as string,
    dishName: r.dishName as string,
    recipe: r.recipe as Recipe,
    ingredientCart: (r.ingredientCart as MatchedIngredient[]) || [],
    matchedProducts: (r.matchedProducts as MatchedIngredient[]) || [],
    completedSteps: (r.completedSteps as number[]) || [],
    instamartOrderId: r.instamartOrderId as string | null,
    status: r.status as DiySession["status"],
    wallPhotoUrl: r.wallPhotoUrl as string | null,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

export async function createDiySession(
  dishName: string,
  recipe: Recipe,
  ingredientCart: MatchedIngredient[],
  matchedProducts: MatchedIngredient[],
): Promise<{ success: boolean; id?: string; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/diy`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ dishName, recipe, ingredientCart, matchedProducts }),
  });
  const data = await res.json();
  return { success: !!data.success, id: data.id, error: data.error };
}

export async function getDiySession(id: string): Promise<{ success: boolean; session?: DiySession; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/diy/${encodeURIComponent(id)}`, { headers: headers() });
  const data = await res.json();
  return { success: !!data.success, session: data.session ? mapSession(data.session) : undefined, error: data.error };
}

export async function updateDiySession(
  id: string,
  fields: Partial<{
    ingredientCart: MatchedIngredient[];
    matchedProducts: MatchedIngredient[];
    completedSteps: number[];
    status: DiySession["status"];
    instamartOrderId: string;
  }>,
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/diy/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(fields),
  });
  const data = await res.json();
  return { success: !!data.success, error: data.error };
}

export async function uploadWallPhoto(
  sessionId: string,
  imageBase64: string,
  mimeType = "image/jpeg",
): Promise<{ success: boolean; wallPhotoUrl?: string; rejected?: boolean; locked?: boolean; reason?: string; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/diy/${encodeURIComponent(sessionId)}/wall-photo`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  const data = await res.json();
  return {
    success: !!data.success,
    wallPhotoUrl: data.wallPhotoUrl,
    rejected: !!data.rejected,
    locked: !!data.locked,
    reason: data.reason,
    error: data.error,
  };
}
