import { API_BASE_URL, getHeaders } from '../../services/apiBase';

export type KitchenCircleSlotState = 'blank' | 'planned' | 'locked' | 'leftovers' | 'no_cook' | 'household_out';

export type RecipeSource = 'catalog' | 'household' | 'ai_draft';

export interface KitchenCircleSlot {
  id: string;
  plannedFor: string;
  state: KitchenCircleSlotState;
  mealTitle: string | null;
  recipeVersionId: string | null;
  /** Present on plan reads; slot mutations return the bare row, so reload the plan to refresh it. */
  recipe?: { recipeId: string; source: RecipeSource; version: number } | null;
  servings: number;
  notes: string | null;
}

export interface RecipeIngredient { name: string; canonicalName?: string; quantity: number; unit: string; optional?: boolean }

export interface RecipeVersion {
  id: string;
  recipeId: string;
  version: number;
  defaultServings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  cuisine: string | null;
  effort: string | null;
  dietaryTags: string[];
  allergens: string[];
  approvedAt: string | null;
  structureIssues: string[];
  groceryReady: boolean;
}

export interface RecipeSummary {
  id: string;
  title: string;
  source: RecipeSource;
  private: boolean;
  pendingReview: boolean;
  currentVersion: {
    id: string; version: number; defaultServings: number; prepMinutes: number | null; cookMinutes: number | null;
    cuisine: string | null; effort: string | null; dietaryTags: string[]; allergens: string[]; approved: boolean; groceryReady: boolean;
  } | null;
}

export interface RecipeDetail { id: string; title: string; source: RecipeSource; private: boolean; versions: RecipeVersion[] }

export interface RecipeDraftInput {
  title: string;
  defaultServings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  prepMinutes?: number;
  cookMinutes?: number;
}

export const RECIPE_UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'clove', 'bunch', 'sprig'] as const;

export const recipeSourceLabel: Record<RecipeSource, string> = {
  catalog: 'Catalog recipe', household: 'Household recipe', ai_draft: 'AI draft · needs review',
};

/** Server-side validation failure carrying the specific recipe-structure problems to show the user. */
export class KitchenCircleError extends Error {
  constructor(message: string, readonly status: number, readonly issues: string[] = [], readonly details: Record<string, unknown> = {}) { super(message); }
}

export type GroceryLineKind = 'recipe' | 'pantry' | 'optional' | 'manual';
export type GroceryLineStatus = 'buy' | 'skipped' | 'already_have';

export interface GrocerySource { slotId: string; plannedFor: string; recipeId: string; recipeTitle: string; recipeVersionId: string; ingredientName: string; recipeQuantity: number; recipeUnit: string; scale: number; baseQuantity: number }

export interface GroceryLine {
  id: string;
  canonicalName: string;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  originalQuantity: number | null;
  originalUnit: string | null;
  kind: GroceryLineKind;
  status: GroceryLineStatus;
  required: boolean;
  freshnessGroup: 'buy_now' | 'buy_later';
  unitConflict: boolean;
  firstNeededOn: string | null;
  sources: GrocerySource[];
  manuallyChanged: boolean;
  productNote: string | null;
  estimatedPricePaise: number | null;
}

export interface GrocerySnapshot {
  id: string;
  planId: string;
  scope: 'week' | 'day';
  scopeDate: string | null;
  referenceDate: string;
  status: 'draft' | 'finalized' | 'discarded';
  freshnessMode: 'split' | 'all_now';
  budgetPaise: number | null;
  createdAt: string;
}

export interface GroceryList {
  snapshot: GrocerySnapshot;
  lines: GroceryLine[];
  coverage: Array<{ slotId: string; plannedFor: string; override: boolean }>;
  planChanges: Array<{ slotId: string; plannedFor: string; reason: string }>;
  totals: { lines: number; buy: number; buyNow: number; buyLater: number; skippedRequired: number; estimatedTotalPaise: number; overBudget: boolean };
  excluded?: Array<{ slotId: string; plannedFor: string; reason: string }>;
}

export interface Pantry { defaults: string[]; items: string[] }

export interface KitchenCirclePlan {
  id: string;
  householdId: string;
  weekStart: string;
  startsOn: string;
  weekEnd: string;
  slots: KitchenCircleSlot[];
}

export interface KitchenCircleHousehold {
  id: string;
  name: string;
  defaultServings: number;
  timezone: string;
  /** Send each day's menu and recipe to the cook automatically. */
  cookAutoSend?: boolean;
  /** The cook who gets it; null = the only (or first) cook. */
  designatedCookUserId?: string | null;
}

interface HouseholdRow { household: KitchenCircleHousehold; role: 'owner' | 'member' | 'cook' }

export function indiaDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function mondayOfDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { ...(await getHeaders()), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ({ error?: string; issues?: string[] } & Record<string, unknown>) | null;
    throw new KitchenCircleError(body?.error ?? `KitchenCircle request failed: ${response.status}`, response.status, body?.issues ?? [], body ?? {});
  }
  return response.json() as Promise<T>;
}

export async function listKitchenCircleHouseholds(): Promise<HouseholdRow[]> {
  const data = await request<{ households: HouseholdRow[] }>('/kitchen-circle/households');
  return data.households;
}

export async function createKitchenCircleHousehold(input: { name: string; defaultServings: number }): Promise<{ household: KitchenCircleHousehold; plan: KitchenCirclePlan }> {
  const data = await request<{ household: KitchenCircleHousehold; plan: KitchenCirclePlan }>('/kitchen-circle/households', {
    method: 'POST',
    body: JSON.stringify({ ...input, startsOn: indiaDate(), timezone: 'Asia/Kolkata' }),
  });
  return data;
}

export async function createKitchenCircleNextWeekPlan(householdId: string): Promise<KitchenCirclePlan> {
  const data = await request<{ plan: KitchenCirclePlan }>(`/kitchen-circle/households/${householdId}/plans/next`, {
    method: 'POST', body: JSON.stringify({ referenceDate: indiaDate() }),
  });
  return data.plan;
}

export async function getKitchenCirclePlan(householdId: string, weekStart: string): Promise<KitchenCirclePlan> {
  const data = await request<{ plan: KitchenCirclePlan }>(`/kitchen-circle/households/${householdId}/plans?weekStart=${encodeURIComponent(weekStart)}`);
  return data.plan;
}

export async function updateKitchenCircleSlot(slotId: string, input: Partial<Pick<KitchenCircleSlot, 'state' | 'mealTitle' | 'servings' | 'notes'>>): Promise<KitchenCircleSlot> {
  const data = await request<{ slot: KitchenCircleSlot }>(`/kitchen-circle/slots/${slotId}`, { method: 'PATCH', body: JSON.stringify(input) });
  return data.slot;
}

export async function setKitchenCircleSlotLock(slotId: string, locked: boolean): Promise<KitchenCircleSlot> {
  const data = await request<{ slot: KitchenCircleSlot }>(`/kitchen-circle/slots/${slotId}/${locked ? 'lock' : 'unlock'}`, { method: 'POST' });
  return data.slot;
}

export async function browseKitchenCircleRecipes(householdId: string, query: { q?: string; source?: RecipeSource } = {}): Promise<RecipeSummary[]> {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.source) params.set('source', query.source);
  const suffix = params.toString() ? `?${params}` : '';
  const data = await request<{ recipes: RecipeSummary[] }>(`/kitchen-circle/households/${householdId}/recipes${suffix}`);
  return data.recipes;
}

export async function getKitchenCircleRecipe(householdId: string, recipeId: string): Promise<RecipeDetail> {
  const data = await request<{ recipe: RecipeDetail }>(`/kitchen-circle/households/${householdId}/recipes/${recipeId}`);
  return data.recipe;
}

export async function createKitchenCircleRecipe(householdId: string, input: RecipeDraftInput): Promise<{ recipe: { id: string; title: string; source: RecipeSource }; version: RecipeVersion }> {
  return request(`/kitchen-circle/households/${householdId}/recipes`, { method: 'POST', body: JSON.stringify(input) });
}

export async function createKitchenCircleRecipeVersion(householdId: string, recipeId: string, input: Omit<RecipeDraftInput, 'title'>): Promise<RecipeVersion> {
  const data = await request<{ version: RecipeVersion }>(`/kitchen-circle/households/${householdId}/recipes/${recipeId}/versions`, { method: 'POST', body: JSON.stringify(input) });
  return data.version;
}

export async function approveKitchenCircleRecipeVersion(householdId: string, versionId: string): Promise<RecipeVersion> {
  const data = await request<{ version: RecipeVersion }>(`/kitchen-circle/households/${householdId}/recipe-versions/${versionId}/approve`, { method: 'POST' });
  return data.version;
}

export interface DishImpactLine { name: string; amount: string }
/** What adding or swapping a dish does to safety and the week's groceries. */
export interface DishImpact {
  safe: boolean;
  warnings: string[];
  replaces: string | null;
  adds: DishImpactLine[];
  needsMore: DishImpactLine[];
  reuses: string[];
  noLongerNeeded: DishImpactLine[];
  pantry: string[];
  groceryList: { covered: boolean; finalized: boolean; cartStatus: string | null };
  summary: string[];
}

/** Has the assistant write a structured recipe; it is saved as an AI draft that a member reviews before planning. */
export async function generateKitchenCircleRecipe(householdId: string, input: { dish: string; servings?: number; notes?: string }): Promise<{
  recipe: { id: string; title: string; source: RecipeSource }; version: RecipeVersion; warnings: string[]; alreadyHave: { id: string; title: string } | null;
}> {
  return request(`/kitchen-circle/households/${householdId}/recipes/generate`, { method: 'POST', body: JSON.stringify(input) });
}

export async function getDishImpact(slotId: string, recipeVersionId: string): Promise<DishImpact> {
  return (await request<{ impact: DishImpact }>(`/kitchen-circle/slots/${slotId}/impact`, { method: 'POST', body: JSON.stringify({ recipeVersionId }) })).impact;
}

export async function selectKitchenCircleRecipe(slotId: string, recipeVersionId: string): Promise<KitchenCircleSlot> {
  const data = await request<{ slot: KitchenCircleSlot }>(`/kitchen-circle/slots/${slotId}/recipe`, { method: 'PATCH', body: JSON.stringify({ recipeVersionId }) });
  return data.slot;
}

export async function getKitchenCirclePantry(householdId: string): Promise<Pantry> {
  return (await request<{ pantry: Pantry }>(`/kitchen-circle/households/${householdId}/pantry`)).pantry;
}

export async function setKitchenCirclePantryItem(householdId: string, name: string, inPantry: boolean): Promise<Pantry> {
  return (await request<{ pantry: Pantry }>(`/kitchen-circle/households/${householdId}/pantry`, { method: 'PUT', body: JSON.stringify({ name, inPantry }) })).pantry;
}

export async function listGroceryLists(householdId: string, planId: string): Promise<Array<GrocerySnapshot & { days: string[] }>> {
  return (await request<{ lists: Array<GrocerySnapshot & { days: string[] }> }>(`/kitchen-circle/households/${householdId}/grocery-lists?planId=${encodeURIComponent(planId)}`)).lists;
}

export async function createGroceryList(householdId: string, input: { planId: string; scope: 'week' | 'day'; date?: string; override?: boolean }): Promise<GroceryList> {
  return request(`/kitchen-circle/households/${householdId}/grocery-lists`, { method: 'POST', body: JSON.stringify({ ...input, referenceDate: indiaDate() }) });
}

export async function getGroceryList(listId: string): Promise<GroceryList> {
  return request(`/kitchen-circle/grocery-lists/${listId}`);
}

export async function updateGroceryList(listId: string, input: { budgetPaise?: number | null; freshnessMode?: 'split' | 'all_now' }): Promise<GroceryList> {
  return request(`/kitchen-circle/grocery-lists/${listId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function updateGroceryLine(listId: string, lineId: string, input: { status?: GroceryLineStatus; quantity?: number; unit?: string; productNote?: string | null; estimatedPricePaise?: number | null }): Promise<{ line: GroceryLine; warning: string | null }> {
  return request(`/kitchen-circle/grocery-lists/${listId}/lines/${lineId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function addGroceryLine(listId: string, input: { name: string; quantity?: number; unit?: string }): Promise<GroceryLine> {
  return (await request<{ line: GroceryLine }>(`/kitchen-circle/grocery-lists/${listId}/lines`, { method: 'POST', body: JSON.stringify(input) })).line;
}

export async function finalizeGroceryList(listId: string): Promise<GroceryList> {
  return request(`/kitchen-circle/grocery-lists/${listId}/finalize`, { method: 'POST' });
}

export async function discardGroceryList(listId: string): Promise<void> {
  await request(`/kitchen-circle/grocery-lists/${listId}/discard`, { method: 'POST' });
}

export interface ProposalItem {
  id: string;
  slotId: string;
  plannedFor: string;
  recipeId: string;
  recipeVersionId: string;
  title: string;
  source: RecipeSource;
  score: number;
  reasons: string[];
  servings: number;
  status: 'proposed' | 'applied' | 'stale';
}

export interface PlanProposal {
  id: string;
  planId: string;
  status: 'pending' | 'applied' | 'discarded' | 'superseded';
  summary: string;
  unfilled: Array<{ slotId: string; plannedFor: string; reason: string }>;
  ignoredRules: string[];
  items: ProposalItem[];
}

export async function getLatestProposal(planId: string): Promise<PlanProposal | null> {
  return (await request<{ proposal: PlanProposal | null }>(`/kitchen-circle/plans/${planId}/proposals/latest`)).proposal;
}

export async function autofillPlan(planId: string, input: { regenerate?: boolean; slotIds?: string[] } = {}): Promise<PlanProposal> {
  return (await request<{ proposal: PlanProposal }>(`/kitchen-circle/plans/${planId}/autofill`, { method: 'POST', body: JSON.stringify(input) })).proposal;
}

export async function applyProposal(planId: string, proposalId: string, input: { itemIds?: string[]; servings?: Record<string, number> }): Promise<{ applied: string[]; stale: Array<{ itemId: string; plannedFor: string; reason: string }>; proposal: PlanProposal }> {
  return request(`/kitchen-circle/plans/${planId}/proposals/${proposalId}/apply`, { method: 'POST', body: JSON.stringify(input) });
}

export async function discardProposal(planId: string, proposalId: string): Promise<void> {
  await request(`/kitchen-circle/plans/${planId}/proposals/${proposalId}/discard`, { method: 'POST' });
}

export async function swapProposalDay(slotId: string, proposalId: string): Promise<ProposalItem> {
  return (await request<{ item: ProposalItem }>(`/kitchen-circle/slots/${slotId}/swap`, { method: 'POST', body: JSON.stringify({ proposalId }) })).item;
}

export type ChatActionStatus = 'applied' | 'needs_confirmation' | 'needs_clarification' | 'confirmed' | 'rejected' | 'failed' | 'expired';

export interface ChatActionCard {
  id: string;
  actionType: string | null;
  payload: { summary?: string } & Record<string, unknown>;
  status: ChatActionStatus;
  policy: string;
  policyNote: string | null;
  clarification: { question: string; options: Array<{ label: string }> } | null;
  result: Record<string, unknown> | null;
}

export interface ChatMessage {
  id: string;
  role: 'member' | 'assistant';
  body: string;
  authorUserId: string | null;
  authorName: string | null;
  createdAt: string;
  actions: ChatActionCard[];
}

export async function listChat(householdId: string, planId: string): Promise<ChatMessage[]> {
  return (await request<{ messages: ChatMessage[] }>(`/kitchen-circle/households/${householdId}/chat?planId=${encodeURIComponent(planId)}`)).messages;
}

/** `clientId` lets the app follow the live steps of this message with `getChatProgress` while it waits. */
export async function sendChat(householdId: string, planId: string, body: string, clientId?: string): Promise<void> {
  await request(`/kitchen-circle/households/${householdId}/chat`, { method: 'POST', body: JSON.stringify({ planId, body, ...(clientId ? { clientId } : {}) }) });
}

/** A voice note: transcribed (with your recipe names as hints), then handled like a typed message. */
export async function sendChatVoice(householdId: string, planId: string, audio: string, mimeType: string, clientId?: string, seconds?: number): Promise<{ transcript: string }> {
  return request(`/kitchen-circle/households/${householdId}/chat/voice`, { method: 'POST', body: JSON.stringify({ planId, audio, mimeType, ...(clientId ? { clientId } : {}), ...(seconds ? { seconds } : {}) }) });
}

export interface ChatProgress { events: Array<{ text: string; at: number }>; next: number; done: boolean }

export async function getChatProgress(householdId: string, clientId: string, after = 0): Promise<ChatProgress> {
  const { events, next, done } = await request<ChatProgress>(`/kitchen-circle/households/${householdId}/chat/progress/${clientId}?after=${after}`);
  return { events, next, done };
}

export const newClientId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export async function confirmChatAction(actionId: string): Promise<ChatActionCard> {
  return (await request<{ action: ChatActionCard }>(`/kitchen-circle/chat/actions/${actionId}/confirm`, { method: 'POST' })).action;
}

export async function rejectChatAction(actionId: string): Promise<void> {
  await request(`/kitchen-circle/chat/actions/${actionId}/reject`, { method: 'POST' });
}

export async function clarifyChatAction(actionId: string, optionIndex: number): Promise<void> {
  await request(`/kitchen-circle/chat/actions/${actionId}/clarify`, { method: 'POST', body: JSON.stringify({ optionIndex }) });
}

export interface CartPack { spin_id: string; sku_id?: string | null; label: string; count: number; unit_price: number | null }
export interface CartProductChoice { name: string; brand: string | null; packs: CartPack[]; purchased: string; surplus: string; cost: number | null }
export interface CartLineView {
  line_id: string;
  name: string;
  status: 'matched' | 'unmatched' | 'unit_mismatch' | 'out_of_stock';
  required: string;
  product: CartProductChoice | null;
  alternatives: CartProductChoice[];
  approximate: boolean;
  explanation: string;
}
export interface CartProposal {
  id: string;
  provider: 'fixture' | 'instamart';
  addressId: string | null;
  scope: 'buy_now' | 'all';
  status: 'preview' | 'superseded' | 'cart_written' | 'payment_pending' | 'ordered' | 'failed';
  lines: CartLineView[];
  totals: { estimated_cost: number; matched: number; unmatched: number; over_cap: boolean; below_minimum: boolean; minimum_amount: number; cap_amount: number };
  warnings: string[];
  cart: { total?: number | null; removed_out_of_stock?: string[]; reduced_quantity?: Array<{ item?: string; capped?: number }> } | null;
  order: { order_id?: string; status?: string; message?: string } | null;
  createdAt: string;
}
export interface CartCapabilities { role: 'owner' | 'member' | 'cook'; liveGrocery: boolean; liveWrites: boolean; ownerLinked: boolean; address: { id: string; label: string } | null }

export async function getLatestCart(listId: string): Promise<{ cart: CartProposal | null; capabilities: CartCapabilities }> {
  return request(`/kitchen-circle/grocery-lists/${listId}/cart`);
}

export async function buildCart(listId: string, scope?: 'buy_now' | 'all'): Promise<{ cart: CartProposal; capabilities: CartCapabilities }> {
  return request(`/kitchen-circle/grocery-lists/${listId}/cart`, { method: 'POST', body: JSON.stringify(scope ? { scope } : {}) });
}

export async function listDeliveryAddresses(householdId: string): Promise<Array<{ id: string; label: string; tag?: string | null }>> {
  return (await request<{ addresses: Array<{ id: string; label: string; tag?: string | null }> }>(`/kitchen-circle/households/${householdId}/delivery-addresses`)).addresses;
}

export async function setDeliveryAddress(householdId: string, addressId: string, label: string): Promise<void> {
  await request(`/kitchen-circle/households/${householdId}/delivery-address`, { method: 'PUT', body: JSON.stringify({ addressId, label }) });
}

export async function writeInstamartCart(cartId: string): Promise<CartProposal> {
  return (await request<{ cart: CartProposal }>(`/kitchen-circle/carts/${cartId}/write`, { method: 'POST' })).cart;
}

export async function placeInstamartOrder(cartId: string, expectedTotal: number, paymentMethod: 'COD' | 'SwiggyPay'): Promise<CartProposal> {
  return (await request<{ cart: CartProposal }>(`/kitchen-circle/carts/${cartId}/checkout`, { method: 'POST', body: JSON.stringify({ confirm: true, expectedTotal, paymentMethod }) })).cart;
}

export const COOK_LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी' }, { code: 'hinglish', label: 'Hinglish' }, { code: 'mr', label: 'मराठी' },
  { code: 'ta', label: 'தமிழ்' }, { code: 'te', label: 'తెలుగు' }, { code: 'bn', label: 'বাংলা' }, { code: 'kn', label: 'ಕನ್ನಡ' },
] as const;
export type CookLanguage = (typeof COOK_LANGUAGES)[number]['code'];

export interface CookDay {
  date: string;
  weekday: string;
  today: boolean;
  cooking: boolean;
  status: string;
  title: string | null;
  servings: number;
  ingredients: Array<{ name: string; quantity: number | null; unit: string; optional: boolean }>;
  steps: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
}
export interface CookView { household: { name: string }; language: CookLanguage; transliterate: boolean; translation: 'ok' | 'partial' | 'fallback' | 'not_needed'; days: CookDay[] }

/** Read-aloud: one spoken part of a cook-view day, in the view's language. Returns the cached audio's path. */
export async function speakFromCookLink(token: string, input: { date: string; part: 'ingredients' | 'step'; index?: number; language?: CookLanguage }): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/kitchen-circle/cook/${encodeURIComponent(token)}/speech`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const body = await response.json().catch(() => null) as { url?: string; error?: string } | null;
  if (!response.ok || !body?.url) throw new KitchenCircleError(body?.error ?? 'Read-aloud isn’t available right now.', response.status);
  return body.url;
}

export async function speakFromCookWeek(householdId: string, input: { date: string; part: 'ingredients' | 'step'; index?: number; language?: CookLanguage }): Promise<string> {
  return (await request<{ url: string }>(`/kitchen-circle/households/${householdId}/cook-week/speech`, { method: 'POST', body: JSON.stringify(input) })).url;
}

export interface MemberSettings { notifyChanges: boolean; notifyWeekend: boolean; notifyTodayMeal: boolean; cookLanguage: CookLanguage; cookTransliterate: boolean }

export async function createCookLink(householdId: string, input: { planId: string; slotId?: string; language: CookLanguage; transliterate?: boolean }): Promise<{ url: string; path: string }> {
  return request(`/kitchen-circle/households/${householdId}/cook-links`, { method: 'POST', body: JSON.stringify(input) });
}

/** Public cook view: no session, the token is the only credential. */
export async function getPublicCookView(token: string, opts: { language?: CookLanguage; transliterate?: boolean } = {}): Promise<CookView> {
  const params = new URLSearchParams();
  if (opts.language) params.set('language', opts.language);
  if (opts.transliterate !== undefined) params.set('transliterate', String(opts.transliterate));
  const response = await fetch(`${API_BASE_URL}/kitchen-circle/cook/${encodeURIComponent(token)}${params.toString() ? `?${params}` : ''}`);
  const body = await response.json().catch(() => null) as { view?: CookView; error?: string } | null;
  if (!response.ok || !body?.view) throw new KitchenCircleError(body?.error ?? 'This cook link could not be opened.', response.status);
  return body.view;
}

export async function getCookWeek(householdId: string, opts: { language?: CookLanguage; transliterate?: boolean } = {}): Promise<CookView> {
  const params = new URLSearchParams();
  if (opts.language) params.set('language', opts.language);
  if (opts.transliterate !== undefined) params.set('transliterate', String(opts.transliterate));
  return (await request<{ view: CookView }>(`/kitchen-circle/households/${householdId}/cook-week${params.toString() ? `?${params}` : ''}`)).view;
}

export async function recordMealFeedback(slotId: string, outcome: 'loved' | 'change' | 'skipped' | 'moved'): Promise<void> {
  await request(`/kitchen-circle/slots/${slotId}/feedback`, { method: 'POST', body: JSON.stringify({ outcome }) });
}

export async function getPlanFeedback(planId: string): Promise<Array<{ slotId: string; mine: string | null; counts: Record<string, number> }>> {
  return (await request<{ days: Array<{ slotId: string; mine: string | null; counts: Record<string, number> }> }>(`/kitchen-circle/plans/${planId}/feedback`)).days;
}

export async function getMemberSettings(householdId: string): Promise<MemberSettings> {
  return (await request<{ settings: MemberSettings }>(`/kitchen-circle/households/${householdId}/my-settings`)).settings;
}

export async function updateMemberSettings(householdId: string, input: Partial<MemberSettings>): Promise<MemberSettings> {
  return (await request<{ settings: MemberSettings }>(`/kitchen-circle/households/${householdId}/my-settings`, { method: 'PUT', body: JSON.stringify(input) })).settings;
}

// ── Phases 0–2 completion ─────────────────────────────────────────────────────

let enabledCache: Promise<boolean> | null = null;
/** Whether KitchenCircle is switched on server-side (cached per app session; failures read as off). */
export function kitchenCircleEnabled(): Promise<boolean> {
  enabledCache ??= fetch(`${API_BASE_URL}/kitchen-circle/status`).then((r) => r.json()).then((b: { enabled?: boolean }) => b.enabled === true).catch(() => false);
  return enabledCache;
}

export interface HouseholdMember { userId: string; role: 'owner' | 'member' | 'cook'; name: string; you: boolean; joinedAt: string }
export interface HouseholdInvite { id: string; email: string | null; phone: string | null; role: 'member' | 'cook'; status: 'pending' | 'accepted' | 'revoked' | 'expired'; expiresAt: string; createdAt: string }
export interface HouseholdRule { id: string; weekday: number | null; strength: 'hard' | 'preference' | 'contextual'; category: string; constraint: Record<string, unknown>; appliesToWeekStart: string | null }
export interface MemberPreference { id: string; strength: 'cannot_eat' | 'never_plan' | 'prefer_less' | 'favourite'; category: string; value: string }
export interface DayPeople { slotId: string; eating: number; people: number; mine: 'attending' | 'absent' | 'not_eating' | null; reactions: { looksGood: number; notForMe: number; mine: 'looks_good' | 'not_for_me' | null } }
export interface Activity { id: number; eventType: string; createdAt: string; after: Record<string, unknown> | null }

/** Pushes one day's menu (with the recipe link) to the household's cook right away. */
export async function sendCookMenu(householdId: string, date: string): Promise<{ sent: boolean; cook: string; title: string; body: string }> {
  return request(`/kitchen-circle/households/${householdId}/cook/send-menu`, { method: 'POST', body: JSON.stringify({ date }) });
}

export async function updateHousehold(householdId: string, input: { name?: string; defaultServings?: number; cookAutoSend?: boolean; designatedCookUserId?: string | null }): Promise<KitchenCircleHousehold> {
  return (await request<{ household: KitchenCircleHousehold }>(`/kitchen-circle/households/${householdId}`, { method: 'PATCH', body: JSON.stringify(input) })).household;
}
export async function listMembers(householdId: string): Promise<HouseholdMember[]> {
  return (await request<{ members: HouseholdMember[] }>(`/kitchen-circle/households/${householdId}/members`)).members;
}
export async function removeMember(householdId: string, userId: string): Promise<void> {
  await request(`/kitchen-circle/households/${householdId}/members/${userId}`, { method: 'DELETE' });
}
export async function listInvites(householdId: string): Promise<HouseholdInvite[]> {
  return (await request<{ invites: HouseholdInvite[] }>(`/kitchen-circle/households/${householdId}/invites`)).invites;
}
export async function createInvite(householdId: string, input: { email?: string; phone?: string; role: 'member' | 'cook' }): Promise<{ id: string; url: string }> {
  return (await request<{ invite: { id: string; url: string } }>(`/kitchen-circle/households/${householdId}/invites`, { method: 'POST', body: JSON.stringify(input) })).invite;
}
export async function resendInvite(inviteId: string): Promise<{ url: string }> {
  return (await request<{ invite: { url: string } }>(`/kitchen-circle/invites/${inviteId}/resend`, { method: 'POST' })).invite;
}
export async function revokeInvite(inviteId: string): Promise<void> {
  await request(`/kitchen-circle/invites/${inviteId}/revoke`, { method: 'POST' });
}
export async function acceptInvite(token: string): Promise<{ householdId: string; role: string }> {
  return request(`/kitchen-circle/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
}
export async function listActivities(householdId: string): Promise<Activity[]> {
  return (await request<{ activities: Activity[] }>(`/kitchen-circle/households/${householdId}/activities`)).activities;
}
export async function listRules(householdId: string): Promise<HouseholdRule[]> {
  return (await request<{ rules: HouseholdRule[] }>(`/kitchen-circle/households/${householdId}/rules`)).rules;
}
export async function createRule(householdId: string, input: Omit<HouseholdRule, 'id' | 'weekday' | 'appliesToWeekStart'> & { weekday?: number; appliesToWeekStart?: string | null }): Promise<HouseholdRule> {
  return (await request<{ rule: HouseholdRule }>(`/kitchen-circle/households/${householdId}/rules`, { method: 'POST', body: JSON.stringify(input) })).rule;
}
export async function removeRule(householdId: string, ruleId: string): Promise<void> {
  await request(`/kitchen-circle/households/${householdId}/rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
}
export async function listMyPreferences(householdId: string): Promise<MemberPreference[]> {
  return (await request<{ preferences: MemberPreference[] }>(`/kitchen-circle/households/${householdId}/preferences/mine`)).preferences;
}
export async function addPreference(householdId: string, input: Omit<MemberPreference, 'id'>): Promise<void> {
  await request(`/kitchen-circle/households/${householdId}/preferences`, { method: 'POST', body: JSON.stringify(input) });
}
export async function deletePreference(householdId: string, preferenceId: string): Promise<void> {
  await request(`/kitchen-circle/households/${householdId}/preferences/${preferenceId}`, { method: 'DELETE' });
}
export async function importMoodFoodPreferences(householdId: string): Promise<number> {
  return (await request<{ imported: number }>(`/kitchen-circle/households/${householdId}/preferences/import-moodfood`, { method: 'POST' })).imported;
}
export async function getPlanPeople(planId: string): Promise<DayPeople[]> {
  return (await request<{ days: DayPeople[] }>(`/kitchen-circle/plans/${planId}/people`)).days;
}
export async function setAttendance(slotId: string, status: 'attending' | 'absent'): Promise<void> {
  await request(`/kitchen-circle/slots/${slotId}/attendance`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export async function reactToDay(slotId: string, reaction: 'looks_good' | 'not_for_me'): Promise<void> {
  await request(`/kitchen-circle/slots/${slotId}/reaction`, { method: 'PATCH', body: JSON.stringify({ reaction }) });
}
