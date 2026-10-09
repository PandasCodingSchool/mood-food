// The preference brain for the signed-in user: facts, house, insight cards,
// "Suggested for you" and how suggestions performed. The intelligence service
// owns all of it (and caches its JEV / LLM judgements by evidence); this proxy
// adds the user, their Swiggy token for live cards, and drops a rejected token.
import { Body, Controller, Get, HttpCode, Logger, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { fail } from '../common/http.js';
import { RateLimit } from '../common/rate-limit.js';
import { IntelligenceService, UpstreamError } from '../intelligence/intelligence.service.js';
import { SwiggyTokensService } from '../swiggy/swiggy-tokens.service.js';

const TIMEOUT_MS = 30_000; // a fresh suggestion matches live Swiggy items
const SLOTS = ['breakfast', 'lunch', 'dinner', 'late_night'] as const;

export const suggestSchema = z
  .object({
    swiggyAddressId: z.string().min(1).max(128).optional(),
    slot: z.enum(SLOTS).optional(),
    daytype: z.enum(['weekday', 'weekend']).optional(),
    weather: z.string().max(20).optional(),
    count: z.number().int().min(2).max(5).optional(),
    refresh: z.boolean().optional(),
  })
  .default({});

/** Pure: the intelligence service's suggest body from the app's request. */
export function suggestBody(input: z.infer<typeof suggestSchema>) {
  return {
    ...(input.swiggyAddressId && { swiggy_address_id: input.swiggyAddressId }),
    ...(input.slot && { slot: input.slot }),
    ...(input.daytype && { daytype: input.daytype }),
    ...(input.weather && { weather: input.weather }),
    ...(input.count && { count: input.count }),
    ...(input.refresh && { refresh: true }),
  };
}

@Controller('brain/me')
export class BrainController {
  private readonly log = new Logger('Brain');

  constructor(
    private readonly intelligence: IntelligenceService,
    private readonly tokens: SwiggyTokensService,
  ) {}

  /** Facts, house (membership, journey, latest event), insight cards, relations. */
  @RateLimit('signals')
  @Get()
  async brain(@CurrentUser() user: AuthUser) {
    return this.call('GET', `/api/brain/${encodeURIComponent(user.id)}`, user.id);
  }

  /** Suggested for you: brain picks for now + one stretch, live when an address is given. */
  @RateLimit('ai')
  @Post('suggest')
  @HttpCode(200)
  async suggest(@CurrentUser() user: AuthUser, @Body({ schema: suggestSchema }) body: z.infer<typeof suggestSchema>) {
    const swiggyToken = await this.tokens.activeToken(user.id);
    return this.call('POST', `/api/brain/${encodeURIComponent(user.id)}/suggest`, user.id, suggestBody(body), swiggyToken);
  }

  /** How suggestions performed: followed by an order, exact / similar, stretch accepted. */
  @RateLimit('signals')
  @Get('success')
  async success(@CurrentUser() user: AuthUser) {
    return this.call('GET', `/api/brain/${encodeURIComponent(user.id)}/success`, user.id);
  }

  private async call(method: 'GET' | 'POST', path: string, userId: string, body?: unknown, swiggyToken?: string | null) {
    try {
      return await this.intelligence.json(method, path, {
        body,
        timeoutMs: TIMEOUT_MS,
        sync: true,
        swiggyToken,
        onTokenRejected: swiggyToken ? () => this.tokens.discardRejected(userId, swiggyToken) : undefined,
      });
    } catch (err) {
      this.log.warn(`${method} ${path} failed: ${(err as Error).message}`);
      const status = err instanceof UpstreamError && err.status && err.status < 500 ? err.status : 502;
      fail(status, status === 502 ? 'Brain unavailable' : 'Invalid brain request');
    }
  }
}
