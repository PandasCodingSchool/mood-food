import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Expo } from 'expo-server-sdk';
import type { Env } from '../config/env.js';
import { DB, ENV, type Database } from '../core/tokens.js';
import { notifications, users } from '../db/schema.js';

export interface NewNotification {
  userId: string;
  type?: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
}

/** In-app notification rows plus best-effort Expo push delivery. */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger('Notifications');
  private readonly expo: Expo;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
  ) {
    this.expo = new Expo({ accessToken: env.EXPO_ACCESS_TOKEN || undefined });
  }

  /** Never throws: notifying is a side effect of the caller's real work. */
  async create(n: NewNotification): Promise<string | null> {
    let id: string;
    try {
      [{ id }] = await this.db
        .insert(notifications)
        .values({ userId: n.userId, type: n.type ?? 'info', title: n.title, body: n.body ?? null, data: n.data ?? {} })
        .returning({ id: notifications.id });
    } catch (err) {
      this.log.error(`create failed: ${(err as Error).message}`);
      return null;
    }
    void this.push(n).catch((err) => this.log.warn(`push failed: ${(err as Error).message}`));
    return id;
  }

  private async push(n: NewNotification) {
    const [row] = await this.db.select({ pushToken: users.pushToken }).from(users).where(eq(users.id, n.userId));
    const to = row?.pushToken;
    if (!to || !Expo.isExpoPushToken(to)) return;
    const chunks = this.expo.chunkPushNotifications([
      { to, sound: 'default', title: n.title, body: n.body ?? '', data: { ...n.data, type: n.type ?? 'info' } },
    ]);
    for (const chunk of chunks) await this.expo.sendPushNotificationsAsync(chunk);
  }
}
