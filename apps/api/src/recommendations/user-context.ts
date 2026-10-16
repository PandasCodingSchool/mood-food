// Server-side context for recommendations: what the API knows about the user
// that clients don't send (order history, ratings, vetoes, saved budget).
// Node fetches, Python decides — the intelligence service interprets it.
import { and, desc, eq, gt, isNotNull } from 'drizzle-orm';
import type { Database } from '../core/tokens.js';
import { orderHistory, predictions, signals, userPreferences } from '../db/schema.js';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ServerContext {
  recentOrders: Array<{ dish: string; rating?: number; date: string }>;
  vetoed: string[];
  /** Saved budget: a max in INR, null = "no limit", undefined = never set. */
  budgetMax?: number | null;
}

const RECENT_ORDERS = 15;
const VETO_WINDOW_DAYS = 14;
// preferences.budget (mobile "Default budget"): 0 Budget, 1 Moderate, 2 Splurge, 3 No limit.
const SAVED_BUDGET_MAX: Record<number, number | null> = { 0: 300, 1: 800, 2: 2000, 3: null };
// The app's generic default query sends budget "medium"; treat it as "not chosen".
const PLACEHOLDER_BUDGETS = new Set(['medium']);

export async function loadServerContext(db: Database, userId: string, now = new Date()): Promise<ServerContext> {
  const since = new Date(now.getTime() - VETO_WINDOW_DAYS * 86_400_000);
  const [orders, rated, vetoes, prefs] = await Promise.all([
    db
      .select({ dish: orderHistory.dishName, createdAt: orderHistory.createdAt })
      .from(orderHistory)
      .where(and(eq(orderHistory.userId, userId), eq(orderHistory.ordered, true)))
      .orderBy(desc(orderHistory.createdAt))
      .limit(RECENT_ORDERS),
    db
      .select({ dish: predictions.dishName, score: predictions.actualScore })
      .from(predictions)
      .where(and(eq(predictions.userId, userId), isNotNull(predictions.actualScore)))
      .orderBy(desc(predictions.resolvedAt))
      .limit(50),
    db
      .select({ payload: signals.payload })
      .from(signals)
      .where(and(eq(signals.userId, userId), eq(signals.type, 'veto'), gt(signals.createdAt, since)))
      .orderBy(desc(signals.id))
      .limit(30),
    db.select({ budget: userPreferences.budget }).from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1),
  ]);

  const ratingByDish = new Map<string, number>();
  for (const r of rated) {
    const key = (r.dish ?? '').toLowerCase();
    if (key && !ratingByDish.has(key) && r.score != null) ratingByDish.set(key, Math.min(5, Math.max(1, r.score)));
  }
  return {
    recentOrders: orders.map((o) => {
      const rating = ratingByDish.get(o.dish.toLowerCase());
      return { dish: o.dish, date: o.createdAt.toISOString(), ...(rating != null && { rating }) };
    }),
    vetoed: [...new Set(vetoes.map((v) => String((v.payload as Obj)?.dish_name ?? '')).filter(Boolean))],
    ...(prefs[0] && prefs[0].budget in SAVED_BUDGET_MAX && { budgetMax: SAVED_BUDGET_MAX[prefs[0].budget] }),
  };
}

/** Merge server context into a built AI request. Client values win, except placeholders. */
export function applyServerContext<T extends { user_context: Obj }>(aiRequest: T, sc: ServerContext): T {
  const ctx = aiRequest.user_context;
  const history = ctx.history ?? {};
  const avoid = [...new Set([...(history.avoid_these ?? []), ...sc.vetoed])];
  const out: Obj = {
    ...ctx,
    ...((sc.recentOrders.length || avoid.length) && {
      history: {
        recent_orders: history.recent_orders?.length ? history.recent_orders : sc.recentOrders,
        avoid_these: avoid,
      },
    }),
  };

  const clientBudgetChoice = ctx.game_data?.raw?.budget ?? ctx.game_data?.budget_tier;
  const usesPlaceholder = !clientBudgetChoice || PLACEHOLDER_BUDGETS.has(String(clientBudgetChoice));
  if (sc.budgetMax !== undefined && usesPlaceholder) {
    const { budget: _drop, ...situational } = ctx.situational ?? {};
    out.situational = sc.budgetMax === null ? situational : { ...situational, budget: { max: sc.budgetMax, currency: 'INR' } };
  }
  return { ...aiRequest, user_context: out };
}
