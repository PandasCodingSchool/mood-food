import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { DB, type Database } from '../core/tokens.js';
import { notifications, users } from '../db/schema.js';
import { NotificationsService } from './notifications.service.js';

const createBody = z.object({
  type: z.string().max(50).default('info'),
  title: z.string({ error: 'title is required' }).min(1, 'title is required').max(255),
  body: z.string().max(2000).nullish(),
  data: z.record(z.string(), z.unknown()).default({}),
});
const pushTokenBody = z.object({
  token: z.string({ error: 'Invalid Expo push token' }).regex(/^Expo(nent)?PushToken\[[\w-]+\]$/, 'Invalid Expo push token'),
});

@Controller('user/notifications')
export class NotificationsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    const list = rows.map(({ userId: _u, ...n }) => n);
    return { success: true, notifications: list, unreadCount: list.filter((n) => !n.read).length };
  }

  /** Self-notification. (v1 let any caller target any userId; server code uses NotificationsService instead.) */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body({ schema: createBody }) body: z.infer<typeof createBody>) {
    const id = await this.notifications.create({ userId: user.id, ...body });
    return { success: !!id, id };
  }

  @Post('register-push-token')
  @HttpCode(200)
  async registerPushToken(@CurrentUser() user: AuthUser, @Body({ schema: pushTokenBody }) body: { token: string }) {
    await this.db.update(users).set({ pushToken: body.token }).where(eq(users.id, user.id));
    return { success: true };
  }

  @Patch('read')
  async readAll(@CurrentUser() user: AuthUser) {
    await this.db.update(notifications).set({ read: true }).where(eq(notifications.userId, user.id));
    return { success: true };
  }

  @Patch(':id/read')
  async readOne(@CurrentUser() user: AuthUser, @Param('id', { schema: z.uuid() }) id: string) {
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
    return { success: true };
  }
}
