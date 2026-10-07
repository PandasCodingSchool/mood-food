// Warm start: when a user links Swiggy, their past Swiggy orders (mapped to
// catalog dishes by the intelligence food graph) become `order` signals for
// the taste model and order_history rows for routines/recency. Idempotent:
// signals dedupe on clientEventId and orders on swiggy_order_id + dish.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type Database } from '../core/tokens.js';
import { orderHistory } from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { type IncomingSignal, SignalsService } from '../signals/signals.service.js';

export interface HistoryItem { name: string; dish_id?: string | null; dish_name?: string | null; confidence?: number }
export interface HistoryOrder {
  order_id: string;
  ordered_at?: string | null;
  restaurant_id?: string | null;
  restaurant_name?: string | null;
  items: HistoryItem[];
}
export interface HistoryResponse { success: boolean; orders?: HistoryOrder[]; error?: string }

const MAX_ORDERS = 20;

/** Pure: which signals and order_history rows an import produces. */
export function planImport(orders: HistoryOrder[]) {
  const signals: IncomingSignal[] = [];
  const rows: Array<{ swiggyOrderId: string; dishName: string; restaurantId: string | null; createdAt: Date | null }> = [];
  for (const o of orders.slice(0, MAX_ORDERS)) {
    const when = o.ordered_at ? new Date(o.ordered_at) : null;
    const createdAt = when && !Number.isNaN(when.getTime()) ? when : null;
    for (const item of o.items) {
      if (!item.dish_id) continue;
      signals.push({
        type: 'order',
        payload: {
          dish_id: item.dish_id,
          dish_name: item.dish_name ?? item.name,
          item_name: item.name,
          source: 'swiggy_history',
          swiggy_order_id: o.order_id,
          restaurant_name: o.restaurant_name ?? null,
        },
        context: { source: 'swiggy_history', ...(createdAt && { ordered_at: createdAt.toISOString() }) },
        clientEventId: `swiggy:${o.order_id}:${item.dish_id}`,
      });
      rows.push({ swiggyOrderId: o.order_id, dishName: item.dish_name ?? item.name, restaurantId: o.restaurant_id ?? null, createdAt });
    }
  }
  return { signals, rows };
}

@Injectable()
export class SwiggyHistoryService {
  private readonly log = new Logger('SwiggyHistory');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly intelligence: IntelligenceService,
    private readonly signals: SignalsService,
  ) {}

  /** Never throws: a failed import only means a colder start. */
  async importFor(userId: string, swiggyToken: string): Promise<{ orders: number; dishes: number }> {
    try {
      const res = await this.intelligence.json<HistoryResponse>('POST', '/api/food-graph/swiggy-history', {
        body: { limit: MAX_ORDERS },
        timeoutMs: 45_000,
        swiggyToken,
        sync: true,
      });
      if (!res.success || !res.orders?.length) return { orders: 0, dishes: 0 };
      const { signals, rows } = planImport(res.orders);

      for (let i = 0; i < signals.length; i += 50) {
        await this.signals.append(userId, signals.slice(i, i + 50));
      }

      const ids = [...new Set(rows.map((r) => r.swiggyOrderId))];
      const existing = ids.length
        ? await this.db
            .select({ id: orderHistory.swiggyOrderId, dish: orderHistory.dishName })
            .from(orderHistory)
            .where(and(eq(orderHistory.userId, userId), inArray(orderHistory.swiggyOrderId, ids)))
        : [];
      const seen = new Set(existing.map((e) => `${e.id}|${e.dish}`));
      const fresh = rows.filter((r) => !seen.has(`${r.swiggyOrderId}|${r.dishName}`));
      if (fresh.length) {
        await this.db.insert(orderHistory).values(
          fresh.map((r) => ({
            userId,
            dishName: r.dishName,
            platform: 'swiggy',
            via: 'swiggy_history',
            swiggyOrderId: r.swiggyOrderId,
            restaurantId: r.restaurantId,
            ...(r.createdAt && { createdAt: r.createdAt }),
          })),
        );
      }
      this.log.log(`imported ${res.orders.length} Swiggy orders → ${signals.length} dish signals for ${userId}`);
      return { orders: res.orders.length, dishes: signals.length };
    } catch (err) {
      this.log.warn(`import failed for ${userId}: ${(err as Error).message}`);
      return { orders: 0, dishes: 0 };
    }
  }
}
