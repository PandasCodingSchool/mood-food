// Server-driven adaptive games. The intelligence service owns content, the
// next question and when to stop; this proxy adds the user and logs the
// lossless signals each answer returns (signed-in users only — anonymous
// sessions, e.g. the site teaser, play without writing to the log).
import { Body, Controller, Get, HttpCode, Logger, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../auth/auth.guard.js';
import type { AppRequest } from '../auth/auth.types.js';
import { fail } from '../common/http.js';
import { RateLimit } from '../common/rate-limit.js';
import { IntelligenceService, UpstreamError } from '../intelligence/intelligence.service.js';
import { buildAiRequest } from '../recommendations/request-builder.js';
import { SignalsService } from '../signals/signals.service.js';

const anyObject = z.record(z.string(), z.unknown()).default({});
const TIMEOUT_MS = 15_000;

interface GameSignal { type: string; payload: unknown }

/** Idempotent signal identities per session answer. */
export function gameSignals(sessionId: string, step: number, signals: GameSignal[] = []) {
  return signals.map((s, i) => ({ ...s, context: { source: 'game_engine', session_id: sessionId }, clientEventId: `game:${sessionId}:${step}:${i}:${s.type}` }));
}

@Public()
@Controller('games')
export class GamesController {
  private readonly log = new Logger('Games');

  constructor(
    private readonly intelligence: IntelligenceService,
    private readonly signals: SignalsService,
  ) {}

  @RateLimit('signals')
  @Post('session')
  @HttpCode(200)
  async start(@Req() req: AppRequest, @Body({ schema: anyObject }) body: Record<string, unknown>) {
    // Same context mapping as recommendations (server IST time bucket, game payloads).
    const { user_context } = buildAiRequest(body, req.user?.id, 'game');
    return this.call('POST', '/api/games/session', {
      user_context,
      ...(body.game ? { game: body.game } : {}),
      ...(req.user?.id && { user_id: req.user.id }),
      ...(typeof body.count === 'number' && { count: body.count }),
    });
  }

  @RateLimit('signals')
  @Post('session/:id/answer')
  @HttpCode(200)
  async answer(@Req() req: AppRequest, @Param('id') id: string, @Body({ schema: anyObject }) body: Record<string, unknown>) {
    const res = (await this.call('POST', `/api/games/session/${encodeURIComponent(id)}/answer`, {
      answer: body.answer ?? {},
      ...(typeof body.reactionMs === 'number' && { reaction_ms: body.reactionMs }),
    })) as { signals?: GameSignal[]; progress?: { step?: number } };
    if (req.user?.id && res.signals?.length) {
      void this.signals.append(req.user.id, gameSignals(id, res.progress?.step ?? 0, res.signals)).catch((err) =>
        this.log.warn(`signal log failed: ${(err as Error).message}`),
      );
    }
    return res;
  }

  @Get('session/:id')
  async status(@Param('id') id: string) {
    return this.call('GET', `/api/games/session/${encodeURIComponent(id)}`);
  }

  private async call(method: 'GET' | 'POST', path: string, body?: unknown) {
    try {
      return await this.intelligence.json(method, path, { body, timeoutMs: TIMEOUT_MS });
    } catch (err) {
      const status = err instanceof UpstreamError && err.status && err.status < 500 ? err.status : 502;
      fail(status, status === 502 ? 'Games unavailable' : 'Invalid game request');
    }
  }
}
