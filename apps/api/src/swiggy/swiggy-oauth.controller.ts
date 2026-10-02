import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Controller, Get, HttpCode, Inject, Logger, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { CurrentUser, Public } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import { fail } from '../common/http.js';
import { ENV, REDIS } from '../core/tokens.js';
import { SwiggyTokensService } from './swiggy-tokens.service.js';

const AUTH_BASE = 'https://mcp.swiggy.com';
const STATE_TTL_SEC = 10 * 60;
const CLIENT_TTL_SEC = 24 * 60 * 60;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

/** Swiggy account linking (OAuth 2.1 + PKCE). PKCE state lives in Redis so any replica can finish the flow. */
@Controller('swiggy/oauth')
export class SwiggyOAuthController {
  private readonly log = new Logger('SwiggyOAuth');

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly tokens: SwiggyTokensService,
  ) {}

  /** Dynamic client registration, cached for a day per redirect URI. */
  private async clientId(): Promise<string> {
    const cacheKey = `swiggy:client:${this.env.SWIGGY_OAUTH_REDIRECT_URI}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;
    const res = await fetch(`${AUTH_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'MoodFood',
        redirect_uris: [this.env.SWIGGY_OAUTH_REDIRECT_URI],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    });
    if (!res.ok) throw new Error(`Swiggy client registration failed: ${res.status} ${await res.text()}`);
    const { client_id } = (await res.json()) as { client_id: string };
    await this.redis.set(cacheKey, client_id, 'EX', CLIENT_TTL_SEC);
    return client_id;
  }

  @Post('initiate')
  @HttpCode(200)
  async initiate(@CurrentUser() user: AuthUser) {
    try {
      const clientId = await this.clientId();
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const state = randomUUID();
      await this.redis.set(`swiggy:state:${state}`, JSON.stringify({ userId: user.id, verifier }), 'EX', STATE_TTL_SEC);
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: this.env.SWIGGY_OAUTH_REDIRECT_URI,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        scope: 'mcp:tools',
      });
      return { success: true, authUrl: `${AUTH_BASE}/auth/authorize?${params}` };
    } catch (err) {
      this.log.error(`initiate failed: ${(err as Error).message}`);
      fail(500, 'Could not start Swiggy linking', { success: false });
    }
  }

  @Public()
  @Get('callback')
  async callback(@Query() q: Record<string, string | undefined>, @Res() reply: FastifyReply) {
    const page = (status: 'success' | 'error', message = '', code = 200) =>
      reply.status(code).type('text/html').send(this.callbackHtml(status, message));
    try {
      if (q.error) return page('error', q.error_description || q.error, 400);
      if (!q.code || !q.state) return page('error', 'Missing code or state', 400);
      const stateKey = `swiggy:state:${q.state}`;
      const raw = await this.redis.getdel(stateKey);
      if (!raw) return page('error', 'Invalid or expired state', 400);
      const { userId, verifier } = JSON.parse(raw) as { userId: string; verifier: string };

      const res = await fetch(`${AUTH_BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: q.code,
          code_verifier: verifier,
          redirect_uri: this.env.SWIGGY_OAUTH_REDIRECT_URI,
        }),
      });
      if (!res.ok) throw new Error(`Swiggy token exchange failed: ${res.status} ${await res.text()}`);
      await this.tokens.save(userId, (await res.json()) as { access_token: string; user_id?: string; expires_in?: number });
      return page('success');
    } catch (err) {
      this.log.error(`callback failed: ${(err as Error).message}`);
      return page('error', 'Could not link your Swiggy account. Please try again.', 500);
    }
  }

  @Post('unlink')
  @HttpCode(200)
  async unlink(@CurrentUser() user: AuthUser) {
    await this.tokens.unlink(user.id);
    return { success: true };
  }

  private callbackHtml(status: 'success' | 'error', message: string) {
    const ok = status === 'success';
    const payload = JSON.stringify({ type: 'swiggy-oauth', status, message }).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Swiggy Connection ${ok ? 'Successful' : 'Failed'}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
    .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 420px; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
    p { color: #6b7280; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? '✅' : '❌'}</div>
    <h1>Swiggy ${ok ? 'Connected' : 'Connection Failed'}</h1>
    <p>${ok ? 'You can close this tab and return to MoodFood.' : escapeHtml(message)}</p>
  </div>
  <script>window.opener?.postMessage(${payload}, ${JSON.stringify(this.env.FRONTEND_ORIGIN)});</script>
</body>
</html>`;
  }
}
