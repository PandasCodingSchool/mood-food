// Swiggy order history → the preference brain's evidence.
//
// Swiggy exposes only a user's most recent orders (5 as of Oct 2026, the same
// for every address, no paging), so history is accumulated: each import sends
// the order ids already stored and gets back only new orders, parsed, mapped
// to catalog dishes and profiled (cuisine, protein, form, spice, heaviness) by
// the intelligence service. New orders are stored in swiggy_orders and every
// item becomes an `order` signal (mapped or not) — the order's own time lives
// in the payload, because the signal log stamps context with *now*.
// Idempotent: orders are unique per user, signals dedupe on clientEventId.
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { DB, ENV, REDIS, type Database } from '../core/tokens.js';
import { instamartOrders, orderHistory, signals, swiggyOrders, swiggyUserTokens } from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { type IncomingSignal, SignalsService } from '../signals/signals.service.js';
import { SwiggyTokensService } from './swiggy-tokens.service.js';

export interface HistoryItem {
  name: string;
  quantity?: number;
  price?: number | null;
  veg?: boolean | null;
  image_url?: string | null;
  dish_id?: string | null;
  dish_name?: string | null;
  map_confidence?: number;
  map_method?: string | null;
  profile?: Record<string, unknown> | null;
}
export interface HistoryOrder {
  order_id: string;
  ordered_at?: string | null;
  meal_slot?: string | null;
  weekday?: string | null;
  is_weekend?: boolean | null;
  restaurant_id?: string | null;
  restaurant_name?: string | null;
  restaurant_area?: string | null;
  total?: number | null;
  items: HistoryItem[];
}
export interface HistoryResponse { success: boolean; orders?: HistoryOrder[]; stats?: Record<string, unknown>; error?: string; token_rejected?: boolean }

export interface GroceryItem { name: string; quantity?: number; brand?: string | null; pack?: string | null; price?: number | null;
  veg?: string | null; image_url?: string | null; product_id?: string | null; profile?: Record<string, unknown> | null }
export interface GroceryOrder { order_id: string; ordered_at?: string | null; meal_slot?: string | null; weekday?: string | null;
  is_weekend?: boolean | null; order_type?: string | null; store_name?: string | null; status?: string | null; total?: number | null;
  items: GroceryItem[] }
export interface GroceryResponse { success: boolean; orders?: GroceryOrder[]; go_to?: GroceryItem[]; error?: string; token_rejected?: boolean }

/** Pure: instamart_orders rows plus `grocery_order` signals (one per order) and a `grocery_go_to` snapshot. */
export function planGroceryImport(orders: GroceryOrder[], goTo: GroceryItem[] = []) {
  const batch: IncomingSignal[] = orders.map((o) => ({
    type: 'grocery_order',
    payload: { ...o, ordered_at: toDate(o.ordered_at)?.toISOString() ?? null, source: 'instamart_history' },
    context: { source: 'instamart_history' },
    clientEventId: `instamart:${o.order_id}`,
  }));
  if (goTo.length) {
    // The go-to list is a snapshot: log it again only when it changes.
    const fingerprint = createHash('sha1').update(goTo.map((i) => i.product_id ?? i.name).join('|')).digest('hex').slice(0, 16);
    batch.push({ type: 'grocery_go_to', payload: { items: goTo, source: 'instamart_history' }, context: { source: 'instamart_history' },
      clientEventId: `instamart:go_to:${fingerprint}` });
  }
  const orderRows = orders.map((o) => ({
    swiggyOrderId: o.order_id,
    orderedAt: toDate(o.ordered_at),
    orderType: o.order_type ?? null,
    storeName: o.store_name ?? null,
    totalInr: o.total != null ? Math.round(o.total) : null,
    items: o.items,
  }));
  return { orderRows, signals: batch };
}

/** Re-import at most this often per user (Swiggy shows only the latest few orders). */
export const REFRESH_EVERY_MS = 6 * 3600_000;
/** Background job: how often to look for users due a refresh, and how many per tick. */
const JOB_EVERY_MS = 30 * 60_000;
const JOB_BATCH = 25;
const JOB_LOCK = 'swiggy:history-refresh:lock';

function toDate(iso?: string | null): Date | null {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Pure: the swiggy_orders rows, `order` signals and order_history rows an import produces. */
export function planImport(orders: HistoryOrder[]) {
  const signalsOut: IncomingSignal[] = [];
  const history: Array<{ swiggyOrderId: string; dishName: string; restaurantId: string | null; priceInr: number; createdAt: Date | null }> = [];
  const orderRows = orders.map((o) => {
    const when = toDate(o.ordered_at);
    o.items.forEach((item, idx) => {
      signalsOut.push({
        type: 'order',
        payload: {
          dish_id: item.dish_id ?? null,
          dish_name: item.dish_name ?? null,
          item_name: item.name,
          quantity: item.quantity ?? 1,
          price: item.price ?? null,
          veg: item.veg ?? null,
          profile: item.profile ?? null,
          map_confidence: item.map_confidence ?? 0,
          source: 'swiggy_history',
          swiggy_order_id: o.order_id,
          restaurant_id: o.restaurant_id ?? null,
          restaurant_name: o.restaurant_name ?? null,
          order_total: o.total ?? null,
          ordered_at: when?.toISOString() ?? null,
          meal_slot: o.meal_slot ?? null,
          weekday: o.weekday ?? null,
          is_weekend: o.is_weekend ?? null,
        },
        context: { source: 'swiggy_history' },
        // Mapped items keep the original key so earlier imports don't duplicate.
        clientEventId: `swiggy:${o.order_id}:${item.dish_id ?? `item${idx}`}`,
      });
      if (item.dish_id) {
        history.push({
          swiggyOrderId: o.order_id,
          dishName: item.dish_name ?? item.name,
          restaurantId: o.restaurant_id ?? null,
          priceInr: Math.round(item.price ?? 0),
          createdAt: when,
        });
      }
    });
    return {
      swiggyOrderId: o.order_id,
      orderedAt: when,
      mealSlot: o.meal_slot ?? null,
      weekday: o.weekday ?? null,
      restaurantId: o.restaurant_id ?? null,
      restaurantName: o.restaurant_name ?? null,
      restaurantArea: o.restaurant_area ?? null,
      totalInr: o.total != null ? Math.round(o.total) : null,
      items: o.items,
    };
  });
  return { orderRows, signals: signalsOut, history };
}

@Injectable()
export class SwiggyHistoryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('SwiggyHistory');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly intelligence: IntelligenceService,
    private readonly signals: SignalsService,
    private readonly tokens: SwiggyTokensService,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.refreshDue(), JOB_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Background refresh: Swiggy shows only a short window of recent orders, so
   * linked users are re-imported every REFRESH_EVERY_MS even if they never open
   * the app. One instance at a time (Redis lock); small batches per tick.
   */
  async refreshDue(): Promise<number> {
    const locked = await this.redis.set(JOB_LOCK, '1', 'PX', JOB_EVERY_MS - 60_000, 'NX').catch(() => null);
    if (locked !== 'OK') return 0;
    const due = await this.db
      .select({ userId: swiggyUserTokens.userId })
      .from(swiggyUserTokens)
      .where(and(
        eq(swiggyUserTokens.isActive, true),
        gt(swiggyUserTokens.expiresAt, new Date()),
        or(isNull(swiggyUserTokens.historySyncedAt), lt(swiggyUserTokens.historySyncedAt, new Date(Date.now() - REFRESH_EVERY_MS))),
      ))
      .limit(JOB_BATCH);
    let done = 0;
    for (const { userId } of due) {
      const token = await this.tokens.activeToken(userId);
      if (!token) continue;
      await this.importAll(userId, token);
      done += 1;
    }
    if (done) this.log.log(`background history refresh: ${done} user(s)`);
    return done;
  }

  /** True when this user's last history check is older than REFRESH_EVERY_MS. */
  async isDue(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ at: swiggyUserTokens.historySyncedAt })
      .from(swiggyUserTokens)
      .where(and(eq(swiggyUserTokens.userId, userId), eq(swiggyUserTokens.isActive, true)))
      .limit(1);
    return !row?.at || Date.now() - row.at.getTime() >= REFRESH_EVERY_MS;
  }

  /** Throttled refresh (app open, background jobs): food and grocery history. */
  async refresh(userId: string, swiggyToken: string) {
    if (!(await this.isDue(userId))) return { orders: 0, dishes: 0, groceries: 0, skipped: true };
    return this.importAll(userId, swiggyToken);
  }

  /** Food (Swiggy) and grocery (Instamart) history; each half is best-effort on its own. */
  async importAll(userId: string, swiggyToken: string) {
    const [food, groceries] = await Promise.all([this.importFor(userId, swiggyToken), this.importGroceries(userId, swiggyToken)]);
    return { ...food, groceries: groceries.orders, goTo: groceries.goTo };
  }

  /** Never throws. New Instamart orders + the go-to list, profiled by the intelligence service. */
  async importGroceries(userId: string, swiggyToken: string): Promise<{ orders: number; goTo: number }> {
    try {
      const known = await this.db
        .select({ id: instamartOrders.swiggyOrderId })
        .from(instamartOrders)
        .where(eq(instamartOrders.userId, userId));
      const res = await this.intelligence.json<GroceryResponse>('POST', '/api/history/groceries/import', {
        body: { known_order_ids: known.map((k) => k.id) },
        timeoutMs: 60_000,
        swiggyToken,
        sync: true,
      });
      if (!res.success) return { orders: 0, goTo: 0 };
      const { orderRows, signals: batch } = planGroceryImport(res.orders ?? [], res.go_to ?? []);
      if (orderRows.length) {
        await this.db
          .insert(instamartOrders)
          .values(orderRows.map((r) => ({ userId, ...r })))
          .onConflictDoNothing({ target: [instamartOrders.userId, instamartOrders.swiggyOrderId] });
      }
      for (let i = 0; i < batch.length; i += 50) {
        await this.signals.append(userId, batch.slice(i, i + 50));
      }
      this.log.log(`imported ${orderRows.length} new Instamart orders, ${res.go_to?.length ?? 0} go-to items for ${userId}`);
      return { orders: orderRows.length, goTo: res.go_to?.length ?? 0 };
    } catch (err) {
      this.log.warn(`grocery import failed for ${userId}: ${(err as Error).message}`);
      return { orders: 0, goTo: 0 };
    }
  }

  /** Never throws: a failed import only means a colder start; the next refresh retries. */
  async importFor(userId: string, swiggyToken: string): Promise<{ orders: number; dishes: number; skipped?: boolean }> {
    try {
      const known = await this.db
        .select({ id: swiggyOrders.swiggyOrderId })
        .from(swiggyOrders)
        .where(eq(swiggyOrders.userId, userId));
      const res = await this.intelligence.json<HistoryResponse>('POST', '/api/history/import', {
        body: { known_order_ids: known.map((k) => k.id) },
        timeoutMs: 60_000,
        swiggyToken,
        sync: true,
      });
      await this.db
        .update(swiggyUserTokens)
        .set({ historySyncedAt: sql`now()` })
        .where(eq(swiggyUserTokens.userId, userId));
      if (!res.success || !res.orders?.length) return { orders: 0, dishes: 0 };

      const { orderRows, signals: batch, history } = planImport(res.orders);
      await this.db
        .insert(swiggyOrders)
        .values(orderRows.map((r) => ({ userId, ...r })))
        .onConflictDoNothing({ target: [swiggyOrders.userId, swiggyOrders.swiggyOrderId] });
      for (let i = 0; i < batch.length; i += 50) {
        await this.signals.append(userId, batch.slice(i, i + 50));
      }

      const ids = [...new Set(history.map((r) => r.swiggyOrderId))];
      const existing = ids.length
        ? await this.db
            .select({ id: orderHistory.swiggyOrderId, dish: orderHistory.dishName })
            .from(orderHistory)
            .where(and(eq(orderHistory.userId, userId), inArray(orderHistory.swiggyOrderId, ids)))
        : [];
      const seen = new Set(existing.map((e) => `${e.id}|${e.dish}`));
      const fresh = history.filter((r) => !seen.has(`${r.swiggyOrderId}|${r.dishName}`));
      if (fresh.length) {
        await this.db.insert(orderHistory).values(
          fresh.map((r) => ({
            userId,
            dishName: r.dishName,
            priceInr: r.priceInr,
            platform: 'swiggy',
            via: 'swiggy_history',
            swiggyOrderId: r.swiggyOrderId,
            restaurantId: r.restaurantId,
            ...(r.createdAt && { createdAt: r.createdAt }),
          })),
        );
      }
      this.log.log(`imported ${res.orders.length} new Swiggy orders → ${batch.length} item signals for ${userId}`);
      return { orders: res.orders.length, dishes: batch.length };
    } catch (err) {
      this.log.warn(`import failed for ${userId}: ${(err as Error).message}`);
      return { orders: 0, dishes: 0 };
    }
  }

  /**
   * Unlink / privacy: remove everything learned from Swiggy and Instamart history
   * (orders, history signals, order_history rows), then rebuild the user's learned state
   * from the remaining log.
   */
  async purge(userId: string) {
    await this.db.delete(swiggyOrders).where(eq(swiggyOrders.userId, userId));
    await this.db.delete(instamartOrders).where(eq(instamartOrders.userId, userId));
    await this.db.delete(orderHistory).where(and(eq(orderHistory.userId, userId), eq(orderHistory.via, 'swiggy_history')));
    await this.db
      .delete(signals)
      .where(and(eq(signals.userId, userId), sql`${signals.context}->>'source' in ('swiggy_history', 'instamart_history')`));
    await this.intelligence.tryJson('POST', '/api/learn/replay', { user_id: userId, from_scratch: true });
  }
}
