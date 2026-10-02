import { Body, Controller, Get, Inject, Logger, type OnApplicationBootstrap, Param, Post } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { fail } from '../common/http.js';
import { DB, type Database } from '../core/tokens.js';
import { quests, userQuests } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SignalsService } from '../signals/signals.service.js';
import { nextProgress, QUEST_DEFINITIONS } from './quests.js';

const progressBody = z
  .object({
    count: z.coerce.number().int().min(1).max(100).catch(1),
    date: z.iso.date().optional(),
  })
  .default({ count: 1 });

/** Streaks & taste-discovery quests: storage and progress bookkeeping. */
@Controller('quests')
export class QuestsController implements OnApplicationBootstrap {
  private readonly log = new Logger('Quests');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly signals: SignalsService,
    private readonly notifications: NotificationsService,
  ) {}

  async onApplicationBootstrap() {
    try {
      for (const q of QUEST_DEFINITIONS) {
        await this.db
          .insert(quests)
          .values({ key: q.key, title: q.title, description: q.description, definition: { target: q.target } })
          .onConflictDoUpdate({
            target: quests.key,
            set: { title: q.title, description: q.description, definition: { target: q.target } },
          });
      }
    } catch (err) {
      this.log.warn(`Quest seeding failed (non-fatal): ${(err as Error).message}`);
    }
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.db
      .select({ quest: quests, progress: userQuests })
      .from(quests)
      .leftJoin(userQuests, and(eq(userQuests.questId, quests.id), eq(userQuests.userId, user.id)))
      .where(eq(quests.active, true))
      .orderBy(quests.id);
    return {
      success: true,
      quests: rows.map(({ quest: q, progress: p }) => ({
        id: q.id,
        key: q.key,
        title: q.title,
        description: q.description,
        target: q.definition.target ?? 1,
        progress: p?.progress.count ?? 0,
        status: p?.status ?? 'active',
        streakCount: p?.streakCount ?? 0,
      })),
    };
  }

  @Post(':key/progress')
  async progress(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body({ schema: progressBody }) body: z.infer<typeof progressBody>,
  ) {
    const quest = await this.db.query.quests.findFirst({ where: eq(quests.key, key) });
    if (!quest) fail(404, 'Quest not found');
    const target = quest.definition.target ?? 1;
    const today = body.date ?? new Date().toISOString().slice(0, 10);

    // Row lock so two quick check-ins can't both read the old streak.
    const { next, status, wasCompleted } = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(userQuests)
        .where(and(eq(userQuests.userId, user.id), eq(userQuests.questId, quest.id)))
        .for('update');
      const next = nextProgress(key, existing ?? null, body.count, today);
      const status = next.count >= target ? 'completed' : 'active';
      const progress = { count: next.count, ...(next.lastCheckinDate && { lastCheckinDate: next.lastCheckinDate }) };
      await tx
        .insert(userQuests)
        .values({ userId: user.id, questId: quest.id, progress, status, streakCount: next.streak })
        .onConflictDoUpdate({
          target: [userQuests.userId, userQuests.questId],
          set: { progress, status, streakCount: next.streak, updatedAt: sql`now()` },
        });
      return { next, status, wasCompleted: existing?.status === 'completed' };
    });

    if (status === 'completed' && !wasCompleted) {
      await this.signals.logOne(user.id, 'quest_event', { quest_key: key, event: 'completed' });
      void this.notifications.create({
        userId: user.id,
        type: 'quest_completed',
        title: 'Quest complete!',
        body: `You completed "${quest.title}".`,
        data: { questKey: key, questTitle: quest.title },
      });
    }
    return { success: true, count: next.count, target, status, streak_count: next.streak };
  }
}
