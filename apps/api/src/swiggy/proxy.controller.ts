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
  async swiggy(@Req() req: AppRequest, @Res() reply: FastifyReply) {
    const swiggyToken = await this.tokens.activeToken(req.user?.id);
    return this.intelligence.proxy(req, reply, { timeoutMs: this.env.SWIGGY_TIMEOUT_MS, swiggyToken, label: 'Swiggy' });
  }

  @All(['instamart', 'instamart/*'])
  async instamart(@Req() req: AppRequest, @Res() reply: FastifyReply) {
    const swiggyToken = await this.tokens.activeToken(req.user?.id);
    return this.intelligence.proxy(req, reply, { timeoutMs: this.env.SWIGGY_TIMEOUT_MS, swiggyToken, label: 'Instamart' });
  }

  @RateLimit('ai')
  @All(['recipe', 'recipe/*'])
  recipe(@Req() req: AppRequest, @Res() reply: FastifyReply) {
    return this.intelligence.proxy(req, reply, { timeoutMs: this.env.RECIPE_TIMEOUT_MS, label: 'Recipe' });
  }
}
