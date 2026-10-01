import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { DB, type Database } from '../core/tokens.js';
import { orderHistory } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const listQuery = z.object({
  tab: z.enum(['all', 'ordered', 'saved']).catch('all'),
  limit: z.coerce.number().int().min(1).max(100).catch(50),
  offset: z.coerce.number().int().min(0).catch(0),
});
const id = z.string().max(255).nullish();
const createBody = z.object({
  dishName: z.string({ error: 'dishName is required' }).trim().min(1, 'dishName is required').max(255),
  cuisine: z.string().max(100).nullish(),
  emoji: z.string().max(16).default('🍽️'),
  priceInr: z.coerce.number().int().min(0).catch(0),
  platform: z.string().max(50).default('swiggy'),
  via: z.string().max(100).nullish(),
  gradientStart: z.string().max(20).default('#f97316'),
  gradientEnd: z.string().max(20).default('#fbbf24'),
  ordered: z.boolean().default(true),
  saved: z.boolean().default(false),
  swiggyOrderId: id,
  restaurantId: id,
  menuItemId: id,
  addressId: id,
});
const patchBody = z.object({ saved: z.boolean({ error: 'saved (boolean) is required' }) });

@Controller('user/history')
export class HistoryController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query({ schema: listQuery }) q: z.infer<typeof listQuery>) {
    const where: SQL[] = [eq(orderHistory.userId, user.id)];
    if (q.tab === 'ordered') where.push(eq(orderHistory.ordered, true));
    if (q.tab === 'saved') where.push(eq(orderHistory.saved, true));
    const rows = await this.db
      .select()
      .from(orderHistory)
      .where(and(...where))
      .orderBy(desc(orderHistory.createdAt))
      .limit(q.limit)
      .offset(q.offset);
    const items = rows.map(({ userId: _u, ...r }) => r);
    return { success: true, items, total: items.length };
  }

  /** Record an order (also notifies) or a saved dish. */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body({ schema: createBody }) body: z.infer<typeof createBody>) {
    const [{ id }] = await this.db
      .insert(orderHistory)
      .values({ ...body, userId: user.id })
      .returning({ id: orderHistory.id });
    if (body.ordered) {
      void this.notifications.create({
        userId: user.id,
        type: 'order_placed',
        title: 'Order placed!',
        body: `Your ${body.dishName} order is on its way.`,
        data: { orderId: id, dishName: body.dishName, platform: body.platform, priceInr: body.priceInr },
      });
    }
    return { success: true, id };
  }

  @Patch(':id')
  async toggleSaved(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: z.uuid() }) historyId: string,
    @Body({ schema: patchBody }) body: z.infer<typeof patchBody>,
  ) {
    await this.db
      .update(orderHistory)
      .set({ saved: body.saved })
      .where(and(eq(orderHistory.id, historyId), eq(orderHistory.userId, user.id)));
    return { success: true };
  }
}
