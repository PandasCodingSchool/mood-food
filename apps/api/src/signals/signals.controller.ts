import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, InternalOnly } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { fail } from '../common/http.js';
import { RateLimit } from '../common/rate-limit.js';
import { DB, type Database } from '../core/tokens.js';
import { signals } from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { KNOWN_SIGNAL_TYPES, SignalsService } from './signals.service.js';

const MAX_BATCH = 50;
const batchBody = z.object({
  signals: z
    .array(z.unknown(), { error: 'signals (non-empty array) is required' })
    .min(1, 'signals (non-empty array) is required')
    .max(MAX_BATCH, `Max ${MAX_BATCH} signals per batch`),
});
const signalShape = z.object({
  type: z.string().refine((t) => KNOWN_SIGNAL_TYPES.has(t)),
  payload: z.unknown().refine((p) => p != null),
  context: z.record(z.string(), z.unknown()).optional(),
  // Retry identity: mobile stamps clientTs on every signal; clientEventId wins when sent.
  clientTs: z.string().max(64).optional(),
  clientEventId: z.string().max(100).optional(),
});
const replayQuery = z.object({
  userId: z.uuid({ error: 'userId is required' }),
  sinceId: z.coerce.number().int().min(0).catch(0),
  limit: z.coerce.number().int().min(1).max(1000).catch(500),
});

@Controller('signals')
export class SignalsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly signals: SignalsService,
    private readonly intelligence: IntelligenceService,
  ) {}

  /** Append a batch; unknown types are dropped (v1 behaviour), an all-invalid batch is a 400. */
  @RateLimit('signals')
  @Post()
  async append(@CurrentUser() user: AuthUser, @Body({ schema: batchBody }) body: z.infer<typeof batchBody>) {
    const valid = body.signals.flatMap((s) => {
      const parsed = signalShape.safeParse(s);
      return parsed.success ? [parsed.data] : [];
    });
    if (!valid.length) fail(400, 'No valid signals in batch');
    const { stored, profile } = await this.signals.append(user.id, valid);
    return { success: true, stored, ...(profile && { profile }) };
  }

  @RateLimit('signals')
  @Get('profile')
  async profile(@CurrentUser() user: AuthUser) {
    const profile = await this.intelligence.tryJson('GET', `/api/profile/${encodeURIComponent(user.id)}`);
    return { success: !!profile, profile };
  }

  /** "People like you are loving…" */
  @RateLimit('signals')
  @Get('twin-taste')
  async twinTaste(@CurrentUser() user: AuthUser) {
    const data = await this.intelligence.tryJson('GET', `/api/twin-taste/${encodeURIComponent(user.id)}`);
    return data ?? { success: false, neighbor_count: 0, dishes: [] };
  }

  /** Replay feed for the intelligence service (x-sync-key only). */
  @InternalOnly()
  @Get('internal')
  async replay(@Query({ schema: replayQuery }) q: z.infer<typeof replayQuery>) {
    const rows = await this.db
      .select({ id: signals.id, type: signals.type, payload: signals.payload, context: signals.context, created_at: signals.createdAt })
      .from(signals)
      .where(and(eq(signals.userId, q.userId), gt(signals.id, q.sinceId)))
      .orderBy(asc(signals.id))
      .limit(q.limit);
    return { signals: rows.map((r) => ({ ...r, context: r.context ?? {} })), has_more: rows.length === q.limit };
  }
}
