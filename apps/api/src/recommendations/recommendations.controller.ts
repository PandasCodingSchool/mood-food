import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Body, Controller, HttpCode, Inject, Logger, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../auth/auth.guard.js';
import type { AppRequest } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import { RateLimit } from '../common/rate-limit.js';
import { DB, ENV, type Database } from '../core/tokens.js';
import { IntelligenceService, UpstreamError } from '../intelligence/intelligence.service.js';
import { PredictionsService } from '../signals/predictions.service.js';
import { SwiggyTokensService } from '../swiggy/swiggy-tokens.service.js';
import { fallbackRecommendations } from './fallback.js';
import { buildAiRequest, extractQuizData } from './request-builder.js';
import { applyServerContext, loadServerContext } from './user-context.js';

const anyObject = z.record(z.string(), z.unknown()).default({});
type AiResponse = Parameters<PredictionsService['recordFromRecommendations']>[1];

const retryable = (err: unknown) =>
  !(err instanceof UpstreamError) || err.status == null || err.status === 408 || err.status === 429 || err.status >= 500;

/**
 * AI recommendations via the intelligence service (shortlist + Swiggy + LLM),
 * falling back to the rule-based engine. Sessions are optional; signed-in
 * users get personalisation, their Swiggy token, and calibration rows.
 */
@Public()
@Controller('ai-recommendations')
export class RecommendationsController {
  private readonly log = new Logger('Recommendations');

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: Database,
    private readonly intelligence: IntelligenceService,
    private readonly tokens: SwiggyTokensService,
    private readonly predictions: PredictionsService,
  ) {}

  @RateLimit('ai')
  @Post()
  @HttpCode(200)
  async recommend(@Req() req: AppRequest, @Body({ schema: anyObject }) body: Record<string, unknown>) {
    const userId = req.user?.id;
    const requestId = randomUUID();
    let aiRequest = buildAiRequest(body, userId, requestId);
    if (userId) {
      try {
        aiRequest = applyServerContext(aiRequest, await loadServerContext(this.db, userId));
      } catch (err) {
        this.log.warn(`server context unavailable: ${(err as Error).message}`);
      }
    }

    try {
      const swiggyToken = await this.tokens.activeToken(userId);
      const onTokenRejected = userId && swiggyToken ? () => this.tokens.discardRejected(userId, swiggyToken) : undefined;
      // One id end to end: body request_id, X-Request-Id header, predictions, intelligence logs.
      const response = await this.callWithRetry(aiRequest, swiggyToken, aiRequest.request_id, onTokenRejected);
      if (userId) void this.predictions.recordFromRecommendations(userId, response, aiRequest.request_id);
      return response;
    } catch (err) {
      this.log.warn(`AI service failed, using fallback: ${(err as Error).message}`);
    }

    return {
      success: false,
      recommendations: fallbackRecommendations(extractQuizData(body)),
      insights: null,
      live_status: 'offline',
      error: 'AI unavailable — showing top-rated fallbacks.',
    };
  }

  private async callWithRetry(
    payload: unknown,
    swiggyToken: string | null,
    requestId: string,
    onTokenRejected?: () => Promise<void>,
  ): Promise<AiResponse> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.intelligence.json<AiResponse>('POST', '/api/ai-recommendations', {
          body: payload,
          timeoutMs: this.env.AI_TIMEOUT_MS,
          swiggyToken,
          requestId,
          onTokenRejected,
        });
      } catch (err) {
        if (attempt >= this.env.AI_MAX_RETRIES || !retryable(err)) throw err;
        await sleep(this.env.AI_RETRY_BASE_DELAY_MS * 2 ** attempt + randomInt(150));
      }
    }
  }
}
