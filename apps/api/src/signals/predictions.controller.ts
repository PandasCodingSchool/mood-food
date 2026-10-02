import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { fail } from '../common/http.js';
import { RateLimit } from '../common/rate-limit.js';
import { DB, type Database } from '../core/tokens.js';
import { predictions } from '../db/schema.js';
import { PredictionsService } from './predictions.service.js';
import { SignalsService } from './signals.service.js';

const score = z.number().min(0).max(10);
const createBody = z.object({
  recId: z.string({ error: 'recId and predictions[] are required' }).min(1).max(255),
  predictions: z
    .array(
      z.object({
        dishId: z.string().max(255).nullish(),
        dishName: z.string().max(255).nullish(),
        predictedScore: z.number().nullish(),
        confidence: z.number().nullish(),
        context: z.unknown().optional(),
      }),
      { error: 'recId and predictions[] are required' },
    )
    .min(1, 'recId and predictions[] are required')
    .transform((l) => l.slice(0, 10)),
});
const resolveBody = z
  .object({ actualScore: score.nullish(), userPredictedScore: score.nullish() })
  .refine((b) => b.actualScore != null || b.userPredictedScore != null, 'actualScore or userPredictedScore is required');
const pendingQuery = z.object({ minAgeMinutes: z.coerce.number().int().min(0).max(10_080).catch(45) });

@RateLimit('signals')
@Controller('predictions')
export class PredictionsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly predictions: PredictionsService,
    private readonly signals: SignalsService,
  ) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body({ schema: createBody }) body: z.infer<typeof createBody>) {
    return { success: true, ids: await this.predictions.record(user.id, body.recId, body.predictions) };
  }

  /** Unresolved predictions old enough to prompt on. */
  @Get('pending')
  async pending(@CurrentUser() user: AuthUser, @Query({ schema: pendingQuery }) q: z.infer<typeof pendingQuery>) {
    const rows = await this.db
      .select({
        id: predictions.id,
        recId: predictions.recId,
        dishId: predictions.dishId,
        dishName: predictions.dishName,
        userPredictedScore: predictions.userPredictedScore,
        createdAt: predictions.createdAt,
      })
      .from(predictions)
      .where(
        and(
          eq(predictions.userId, user.id),
          isNull(predictions.actualScore),
          lt(predictions.createdAt, sql`now() - make_interval(mins => ${q.minAgeMinutes})`),
        ),
      )
      .orderBy(desc(predictions.createdAt))
      .limit(5);
    return { success: true, pending: rows };
  }

  /** Post-meal (actualScore) or blind-bet (userPredictedScore) outcome, routed into the signals spine. */
  @Post(':id/resolve')
  async resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: resolveBody }) body: z.infer<typeof resolveBody>,
  ) {
    const [row] = await this.db
      .update(predictions)
      .set({
        ...(body.actualScore != null && { actualScore: body.actualScore, resolvedAt: new Date() }),
        ...(body.userPredictedScore != null && { userPredictedScore: body.userPredictedScore }),
      })
      .where(and(eq(predictions.id, id), eq(predictions.userId, user.id)))
      .returning();
    if (!row) fail(404, 'Prediction not found');

    const isPostMeal = body.actualScore != null;
    const payload = isPostMeal
      ? {
          prediction_id: id,
          rec_id: row.recId,
          dish_id: row.dishId,
          dish_name: row.dishName,
          predicted_score: row.predictedScore,
          actual_score: body.actualScore,
        }
      : { prediction_id: id, rec_id: row.recId, dish_id: row.dishId, user_predicted_score: body.userPredictedScore };
    await this.signals.logOne(user.id, isPostMeal ? 'post_meal' : 'blind_bet', payload, (row.context as Record<string, unknown>) ?? {});
    return { success: true };
  }
}
