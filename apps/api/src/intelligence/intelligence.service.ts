import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../config/env.js';
import { fetchWithTimeout, isAbort } from '../common/http.js';
import { ENV } from '../core/tokens.js';

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Client for the Python intelligence service (recommendations, Swiggy MCP,
 * learning). Adds the service key, the per-user Swiggy token and the request
 * id so logs line up across both services.
 */
@Injectable()
export class IntelligenceService {
  private readonly log = new Logger('Intelligence');

  constructor(@Inject(ENV) private readonly env: Env) {}

  headers(opts: { swiggyToken?: string | null; requestId?: string; sync?: boolean } = {}) {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.env.AI_SERVICE_KEY) h.Authorization = `Bearer ${this.env.AI_SERVICE_KEY}`;
    if (opts.swiggyToken) h['X-Swiggy-User-Token'] = opts.swiggyToken;
    if (opts.requestId) h['X-Request-Id'] = opts.requestId;
    if (opts.sync && this.env.INTELLIGENCE_SYNC_KEY) h['x-sync-key'] = this.env.INTELLIGENCE_SYNC_KEY;
    return h;
  }

  /** JSON request; throws UpstreamError on non-2xx or timeout. */
  async json<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; timeoutMs: number; swiggyToken?: string | null; requestId?: string; sync?: boolean },
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchWithTimeout(this.env.AI_SERVICE_URL + path, {
        method,
        headers: this.headers(opts),
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        timeoutMs: opts.timeoutMs,
      });
    } catch (err) {
      throw new UpstreamError(isAbort(err) ? `timeout on ${path}` : (err as Error).message);
    }
    if (!res.ok) throw new UpstreamError(`Intelligence service ${res.status} on ${path}`, res.status);
    return (await res.json()) as T;
  }

  /** Learning-service calls are best-effort: the signals log can be replayed. */
  async tryJson<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T | null> {
    try {
      return await this.json<T>(method, path, { body, timeoutMs: this.env.LEARN_TIMEOUT_MS, sync: true });
    } catch (err) {
      this.log.warn(`${method} ${path} failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Pass-through proxy for /api/swiggy/*, /api/instamart/* and /api/recipe/*:
   * same method, path, query and JSON body; upstream status and body returned as-is.
   */
  async proxy(
    req: FastifyRequest,
    reply: FastifyReply,
    opts: { timeoutMs: number; swiggyToken?: string | null; label: string },
  ) {
    const target = this.env.AI_SERVICE_URL + req.url;
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    try {
      const res = await fetchWithTimeout(target, {
        method: req.method,
        headers: this.headers({ swiggyToken: opts.swiggyToken, requestId: String(req.id) }),
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
        timeoutMs: opts.timeoutMs,
      });
      const text = await res.text();
      return reply
        .status(res.status)
        .header('content-type', res.headers.get('content-type') || 'application/json')
        .send(text);
    } catch (err) {
      const aborted = isAbort(err);
      this.log.warn(`${opts.label} proxy error for ${req.url}: ${(err as Error).message}`);
      return reply.status(aborted ? 504 : 502).send({
        success: false,
        error: aborted ? `${opts.label} service timed out.` : `${opts.label} service unavailable.`,
      });
    }
  }
}

@Global()
@Module({ providers: [IntelligenceService], exports: [IntelligenceService] })
export class IntelligenceModule {}
