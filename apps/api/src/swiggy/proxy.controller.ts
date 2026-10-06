import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../auth/auth.guard.js';
import type { AppRequest } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import { RateLimit } from '../common/rate-limit.js';
import { ENV } from '../core/tokens.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { SwiggyTokensService } from './swiggy-tokens.service.js';

/**
 * Thin proxies to the intelligence service, which owns the Swiggy MCP client.
 * When the caller has linked Swiggy, their decrypted token travels in a private
 * header; the client never sees it. Sessions are optional (bootstrap token otherwise).
 */
@Public()
@Controller()
export class ProxyController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly intelligence: IntelligenceService,
    private readonly tokens: SwiggyTokensService,
  ) {}

  @All(['swiggy', 'swiggy/*'])
  swiggy(@Req() req: AppRequest, @Res() reply: FastifyReply) {
    return this.withUserToken(req, reply, 'Swiggy');
  }

  @All(['instamart', 'instamart/*'])
  instamart(@Req() req: AppRequest, @Res() reply: FastifyReply) {
    return this.withUserToken(req, reply, 'Instamart');
  }

  @RateLimit('ai')
  @All(['recipe', 'recipe/*'])
  recipe(@Req() req: AppRequest, @Res() reply: FastifyReply) {
    return this.intelligence.proxy(req, reply, { timeoutMs: this.env.RECIPE_TIMEOUT_MS, label: 'Recipe' });
  }

  /** If Swiggy rejects the forwarded token, the link is dropped so the app asks the user to reconnect. */
  private async withUserToken(req: AppRequest, reply: FastifyReply, label: string) {
    const userId = req.user?.id;
    const swiggyToken = await this.tokens.activeToken(userId);
    return this.intelligence.proxy(req, reply, {
      timeoutMs: this.env.SWIGGY_TIMEOUT_MS,
      swiggyToken,
      label,
      onTokenRejected: userId && swiggyToken ? () => this.tokens.discardRejected(userId, swiggyToken) : undefined,
    });
  }
}
