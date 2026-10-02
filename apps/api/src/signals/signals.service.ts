import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../core/tokens.js';
import { orderHistory, signals, tasteVector, users } from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';

export const KNOWN_SIGNAL_TYPES = new Set([
  'mood_checkin', 'swipe', 'this_or_that', 'post_meal', 'veto', 'craving', 'occasion',
  'mind_reader_verdict', 'wildcard_verdict', 'sos', 'day_story', 'bracket', 'group_swipe',
  'nostalgia', 'hunger', 'pantry', 'blind_bet', 'quest_event', 'game_signals', 'order',
]);

export interface StoredSignal {
  id: number;
  type: string;
  payload: unknown;
  context: Record<string, unknown>;
}

interface LearnResult {
  taste_vector?: { embedding: number[]; dim?: number; model_version?: string };
  profile_summary?: { persona_archetype?: string; question_budget?: number; [k: string]: unknown };
}

/** Time-of-day bucket in IST — the app's market (v1 used the server's clock). */
function istParts(now: Date) {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const hour = ist.getUTCHours();
  const day = ist.getUTCDay();
  return {
    hour,
    time_of_day: hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 22 ? 'dinner' : 'late_night',
    day_of_week: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day],
    is_weekend: day === 0 || day === 6,
  };
}

/** The append-only personalization log and its hand-off to the learning service. */
@Injectable()
export class SignalsService {
  private readonly log = new Logger('Signals');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly intelligence: IntelligenceService,
  ) {}

  /** Server-side context stamped on every signal at write time. */
  async serverContext(userId: string, client: Record<string, unknown> = {}) {
    const now = new Date();
    const [last] = await this.db
      .select({ createdAt: orderHistory.createdAt })
      .from(orderHistory)
      .where(eq(orderHistory.userId, userId))
      .orderBy(desc(orderHistory.createdAt))
      .limit(1);
    const hoursSinceLastMeal = last ? Math.round(((now.getTime() - last.createdAt.getTime()) / 36e5) * 10) / 10 : null;
    return {
      ...client,
      ...istParts(now),
      ...(hoursSinceLastMeal != null && { hours_since_last_meal: hoursSinceLastMeal }),
      server_ts: now.toISOString(),
    };
  }

  /** Store a batch, forward it to learning, mirror what comes back. Returns the learned profile summary if any. */
  async append(userId: string, batch: Array<{ type: string; payload: unknown; context?: Record<string, unknown> }>) {
    const base = await this.serverContext(userId);
    const rows = await this.db
      .insert(signals)
      .values(batch.map((s) => ({ userId, type: s.type, payload: s.payload, context: { ...s.context, ...base } })))
      .returning({ id: signals.id, type: signals.type, payload: signals.payload, context: signals.context });
    const stored = rows as StoredSignal[];
    const learned = await this.forward(userId, stored);
    return { stored: stored.length, profile: learned?.profile_summary ?? null };
  }

  /** Single internal write (quests, predictions, ...). Context is used as given. */
  async logOne(userId: string, type: string, payload: unknown, context: Record<string, unknown> = {}) {
    const [row] = await this.db.insert(signals).values({ userId, type, payload, context }).returning({ id: signals.id });
    await this.forward(userId, [{ id: row.id, type, payload, context }]);
    return row.id;
  }

  private async forward(userId: string, stored: StoredSignal[]) {
    const learned = await this.intelligence.tryJson<LearnResult>('POST', '/api/learn/signals', { user_id: userId, signals: stored });
    if (!learned) return null;
    try {
      const tv = learned.taste_vector;
      if (tv?.embedding) {
        const values = { embedding: tv.embedding, dim: tv.dim ?? tv.embedding.length, modelVersion: tv.model_version ?? null };
        await this.db
          .insert(tasteVector)
          .values({ userId, ...values })
          .onConflictDoUpdate({ target: tasteVector.userId, set: { ...values, updatedAt: sql`now()` } });
      }
      const p = learned.profile_summary;
      if (p && (p.persona_archetype || p.question_budget != null)) {
        await this.db
          .update(users)
          .set({
            ...(p.persona_archetype && { personaArchetype: p.persona_archetype }),
            ...(p.question_budget != null && { questionBudget: p.question_budget }),
          })
          .where(eq(users.id, userId));
      }
    } catch (err) {
      this.log.warn(`learned-state mirror failed: ${(err as Error).message}`);
    }
    return learned;
  }
}
