import { Body, Controller, Get, HttpCode, Inject, Logger, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { Public } from '../auth/auth.guard.js';
import type { Env } from '../config/env.js';
import { fail, fetchWithTimeout } from '../common/http.js';
import { ENV, REDIS } from '../core/tokens.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';

const RAIN = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);
const SNOW = new Set([71, 73, 75, 77, 85, 86]);
const weatherQuery = z.object({
  lat: z.coerce.number({ error: 'lat and lon are required' }).min(-90).max(90),
  lon: z.coerce.number({ error: 'lat and lon are required' }).min(-180).max(180),
});

export function weatherFrom(code: number | undefined, tempC: number | undefined) {
  if (tempC != null && tempC >= 30) return 'hot';
  if (code == null) return 'any';
  if (RAIN.has(code)) return 'rainy';
  if (SNOW.has(code)) return 'cold';
  if (code === 0 || code === 1) return 'sunny';
  return 'any';
}

/** Passive context and lightweight AI helpers. Public. */
@Public()
@Controller()
export class ContextController {
  private readonly log = new Logger('Context');

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly intelligence: IntelligenceService,
  ) {}

  /** Keyless Open-Meteo lookup, cached 10 min per ~1 km cell. */
  @Get('weather')
  async weather(@Query({ schema: weatherQuery }) q: z.infer<typeof weatherQuery>) {
    const lat = q.lat.toFixed(2);
    const lon = q.lon.toFixed(2);
    const cacheKey = `weather:${lat}:${lon}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);
    try {
      const res = await fetchWithTimeout(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`,
        { timeoutMs: 5000 },
      );
      if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
      const data = (await res.json()) as { current?: { weather_code?: number; temperature_2m?: number } };
      const tempC = data.current?.temperature_2m;
      const result = { success: true, weather: weatherFrom(data.current?.weather_code, tempC), temperature_c: tempC ?? null };
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 600).catch(() => {});
      return result;
    } catch (err) {
      this.log.warn(`weather failed: ${(err as Error).message}`);
      return { success: false, weather: 'any', temperature_c: null };
    }
  }

  /** Mid-game LLM assist; fast timeout, the client falls back to static options. */
  @Post('game-assist')
  @HttpCode(200)
  async gameAssist(@Body({ schema: z.looseObject({ kind: z.string({ error: 'kind required' }).min(1, 'kind required') }) }) body: Record<string, unknown>) {
    try {
      return await this.intelligence.json('POST', '/api/game-assist', { body, timeoutMs: this.env.GAME_ASSIST_TIMEOUT_MS });
    } catch (err) {
      this.log.warn(`game assist failed: ${(err as Error).message}`);
      fail(503, 'ai_unavailable');
    }
  }

  /** Placeholder the app already calls (never implemented in v1): no questions yet. */
  @Get('signals/understand-me')
  understandMe(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'private, max-age=300');
    return { success: true, questions: [] };
  }
}
