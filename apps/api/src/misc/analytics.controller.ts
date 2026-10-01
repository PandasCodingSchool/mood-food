import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Body, Controller, Get, HttpCode, Inject, Logger, Post, Req, Res } from '@nestjs/common';
import { count, desc, gt, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AdminOnly, Public } from '../auth/auth.guard.js';
import type { AppRequest } from '../auth/auth.types.js';
import { fail, isUniqueViolation } from '../common/http.js';
import { DB, type Database } from '../core/tokens.js';
import { analyticsEvents, orderClicks, quizCompletions, waitlist } from '../db/schema.js';

const WAITLIST_BASE = 100;
const waitlistBody = z.object({
  name: z.string({ error: 'Name and email are required' }).trim().min(1, 'Name and email are required').max(255),
  email: z.email('Name and email are required').trim().toLowerCase().max(255),
  city: z.string().trim().max(255).nullish(),
  cuisine: z.string().trim().max(50).nullish(),
});
const eventBody = z.object({
  event: z.string({ error: 'Event name is required' }).min(1, 'Event name is required').max(255),
  properties: z.record(z.string(), z.unknown()).default({}),
});
const quizBody = z.object({ mood: z.string().max(50), craving: z.string().max(50), budget: z.string().max(50), preference: z.string().max(50) });
const clickBody = z.object({
  dish_name: z.string({ error: 'dish_name is required' }).min(1, 'dish_name is required').max(255),
  dish_type: z.string().max(50).default('main'),
  platform: z.string().max(50).default('swiggy'),
});
const sevenDaysAgo = sql`now() - interval '7 days'`;
const day = sql<string>`to_char(date_trunc('day', ${analyticsEvents.createdAt}), 'YYYY-MM-DD')`;
const clickDay = sql<string>`to_char(date_trunc('day', ${orderClicks.createdAt}), 'YYYY-MM-DD')`;

/** Waitlist + product analytics (public writes) and the admin read side. */
@Controller()
export class AnalyticsController {
  private readonly log = new Logger('Analytics');

  constructor(@Inject(DB) private readonly db: Database) {}

  @Public()
  @Get('waitlist/count')
  async waitlistCount() {
    const [{ n }] = await this.db.select({ n: count() }).from(waitlist);
    return { count: n, base: WAITLIST_BASE, total: WAITLIST_BASE + n };
  }

  @Public()
  @Post('waitlist')
  async joinWaitlist(@Body({ schema: waitlistBody }) body: z.infer<typeof waitlistBody>) {
    try {
      const [row] = await this.db.insert(waitlist).values(body).returning();
      return { success: true, data: row };
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, 'Email already registered');
      throw err;
    }
  }

  /** Never fails the client: analytics is fire-and-forget. */
  @Public()
  @Post('analytics')
  async track(@Body({ schema: eventBody }) body: z.infer<typeof eventBody>, @Req() req: AppRequest) {
    try {
      await this.db.insert(analyticsEvents).values({
        eventName: body.event,
        properties: body.properties,
        userId: req.user?.id ?? null,
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
      });
      return { success: true };
    } catch (err) {
      this.log.warn(`analytics insert failed: ${(err as Error).message}`);
      return { success: false, logged: false };
    }
  }

  @Public()
  @Post('quiz-complete')
  async quizComplete(@Body({ schema: quizBody }) body: z.infer<typeof quizBody>) {
    await this.db.insert(quizCompletions).values(body);
    return { success: true };
  }

  @Public()
  @Post('analytics/order-click')
  @HttpCode(200)
  async orderClick(@Body({ schema: clickBody }) body: z.infer<typeof clickBody>, @Req() req: AppRequest) {
    await this.db.insert(orderClicks).values({
      dishName: body.dish_name,
      dishType: body.dish_type,
      platform: body.platform,
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip,
    });
    return { success: true };
  }

  @AdminOnly()
  @Get('admin/analytics')
  async adminAnalytics() {
    const [events, [w], [quiz], daily] = await Promise.all([
      this.db
        .select({ event_name: analyticsEvents.eventName, count: count() })
        .from(analyticsEvents)
        .groupBy(analyticsEvents.eventName)
        .orderBy(desc(count())),
      this.db.select({ n: count() }).from(waitlist),
      this.db.select({ n: count() }).from(quizCompletions),
      this.db
        .select({ date: day, event_name: analyticsEvents.eventName, count: count() })
        .from(analyticsEvents)
        .where(gt(analyticsEvents.createdAt, sevenDaysAgo))
        .groupBy(day, analyticsEvents.eventName)
        .orderBy(desc(day)),
    ]);
    return { events, waitlistCount: w.n, quizCompletions: quiz.n, dailyStats: daily };
  }

  @AdminOnly()
  @Get('admin/waitlist')
  async adminWaitlist() {
    return { data: await this.db.select().from(waitlist).orderBy(desc(waitlist.createdAt)) };
  }

  @AdminOnly()
  @Get('admin/order-clicks')
  async adminOrderClicks() {
    const [[total], byType, topDishes, daily] = await Promise.all([
      this.db.select({ n: count() }).from(orderClicks),
      this.db.select({ dish_type: orderClicks.dishType, count: count() }).from(orderClicks).groupBy(orderClicks.dishType),
      this.db
        .select({ dish_name: orderClicks.dishName, clicks: count() })
        .from(orderClicks)
        .groupBy(orderClicks.dishName)
        .orderBy(desc(count()))
        .limit(10),
      this.db
        .select({ date: clickDay, count: count() })
        .from(orderClicks)
        .where(gt(orderClicks.createdAt, sevenDaysAgo))
        .groupBy(clickDay)
        .orderBy(desc(clickDay)),
    ]);
    return { totalClicks: total.n, clicksByType: byType, topDishes, dailyClicks: daily };
  }
}

/** Admin panel page (served outside the /api prefix). Its API calls use HTTP Basic auth. */
@Public()
@Controller('admin')
export class AdminPageController {
  private html: string | null = null;

  @Get()
  async page(@Res() reply: FastifyReply) {
    this.html ??= await readFile(resolve(import.meta.dirname, '../../public/admin.html'), 'utf8');
    return reply.type('text/html').send(this.html);
  }
}
