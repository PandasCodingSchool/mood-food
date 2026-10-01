import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB, type Database } from '../core/tokens.js';
import { predictions } from '../db/schema.js';

export interface NewPrediction {
  dishId?: string | null;
  dishName?: string | null;
  predictedScore?: number | null;
  confidence?: number | null;
  context?: unknown;
}

/** Calibration loop rows: written at recommendation time, resolved post-meal. */
@Injectable()
export class PredictionsService {
  private readonly log = new Logger('Predictions');

  constructor(@Inject(DB) private readonly db: Database) {}

  async record(userId: string, recId: string, list: NewPrediction[]) {
    if (!list.length) return [];
    const rows = await this.db
      .insert(predictions)
      .values(
        list.map((p) => ({
          userId,
          recId,
          dishId: p.dishId ?? null,
          dishName: p.dishName ?? null,
          predictedScore: p.predictedScore ?? null,
          confidence: p.confidence ?? null,
          context: p.context ?? null,
        })),
      )
      .returning({ id: predictions.id });
    return rows.map((r) => r.id);
  }

  /** From an intelligence response; best-effort. */
  recordFromRecommendations(
    userId: string,
    response: { request_id?: string; meta?: { confidence?: number }; recommendations?: Array<{ dish?: { id?: string; name?: string }; predicted_score?: number }> },
    fallbackRecId: string,
  ) {
    const recs = response.recommendations?.slice(0, 5) ?? [];
    return this.record(
      userId,
      response.request_id || fallbackRecId,
      recs.map((r) => ({
        dishId: r.dish?.id,
        dishName: r.dish?.name,
        predictedScore: r.predicted_score,
        confidence: response.meta?.confidence,
      })),
    ).catch((err) => {
      this.log.warn(`insert failed: ${(err as Error).message}`);
      return [];
    });
  }
}
