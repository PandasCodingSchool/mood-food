import { createHash } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { ENV, REDIS } from '../core/tokens.js';
import { fail } from './http.js';

export type LimitName = 'general' | 'ip' | 'ai' | 'signals' | 'otpSend' | 'otpVerify' | 'login';

interface LimitSpec {
  max: number;
  windowSec: number;
  message: string;
  /** Bucket key; defaults to the client IP. */
  key?: (req: FastifyRequest) => string | undefined;
}

const WINDOW = 15 * 60;
const TOO_MANY = 'Too many requests, please try again later.';
const bodyPhone = (req: FastifyRequest) => {
  const phone = (req.body as { phone?: unknown } | undefined)?.phone;
  return typeof phone === 'string' ? phone.replace(/[^\d+]/g, '') : undefined;
};

/** Per signed-in device when a token is sent (users behind one carrier IP don't share a bucket), else per IP. */
const sessionOrIp = (req: FastifyRequest) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '') || req.headers['x-session-id'];
  return typeof token === 'string' && token ? `t:${createHash('sha256').update(token).digest('hex').slice(0, 24)}` : undefined;
};

const RATE_LIMITS = Symbol('RATE_LIMITS');

/** Extra fixed-window limits for a route, on top of the global `general` + `ip` limits. */
export const RateLimit = (...names: LimitName[]) => SetMetadata(RATE_LIMITS, names);
/** Exempt from all limits (health checks). */
export const NoRateLimit = () => SetMetadata(RATE_LIMITS, 'none');

/**
 * Redis fixed-window rate limiter shared by every API replica (replaces v1's
 * in-memory express-rate-limit). Fails open if Redis is unreachable.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly log = new Logger('RateLimit');
  private readonly specs: Record<LimitName, LimitSpec>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) env: Env,
  ) {
    this.specs = {
      general: { max: env.RATE_LIMIT_GENERAL, windowSec: WINDOW, message: TOO_MANY, key: sessionOrIp },
      ip: { max: env.RATE_LIMIT_IP, windowSec: WINDOW, message: TOO_MANY },
      ai: {
        max: env.RATE_LIMIT_AI,
        windowSec: WINDOW,
        message: 'Too many recommendation requests. Please wait a few minutes before trying again.',
        key: sessionOrIp,
      },
      signals: { max: env.RATE_LIMIT_SIGNALS, windowSec: WINDOW, message: TOO_MANY, key: sessionOrIp },
      otpSend: { max: 5, windowSec: WINDOW, message: 'Too many OTP requests. Please try again later.', key: bodyPhone },
      otpVerify: {
        max: 10,
        windowSec: WINDOW,
        message: 'Too many verification attempts. Please try again later.',
        key: bodyPhone,
      },
      login: { max: 10, windowSec: WINDOW, message: 'Too many login attempts. Please try again later.', key: bodyPhone },
    };
  }

  async canActivate(ctx: ExecutionContext) {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const reply = ctx.switchToHttp().getResponse<FastifyReply>();
    const extra = this.reflector.getAllAndOverride<LimitName[] | 'none' | undefined>(RATE_LIMITS, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (extra === 'none') return true;
    for (const name of ['ip', 'general', ...(extra ?? [])] as LimitName[]) {
      await this.hit(name, req, reply);
    }
    return true;
  }

  private async hit(name: LimitName, req: FastifyRequest, reply: FastifyReply) {
    const spec = this.specs[name];
    const subject = spec.key?.(req) || req.ip || 'unknown';
    const windowStart = Math.floor(Date.now() / 1000 / spec.windowSec);
    const key = `rl:${name}:${subject}:${windowStart}`;
    let count: number;
    try {
      const res = await this.redis.multi().incr(key).expire(key, spec.windowSec, 'NX').exec();
      count = Number(res?.[0]?.[1] ?? 0);
    } catch (err) {
      this.log.warn(`rate limiter unavailable: ${(err as Error).message}`);
      return;
    }
    if (name === 'general') {
      reply.header('RateLimit-Limit', spec.max);
      reply.header('RateLimit-Remaining', Math.max(0, spec.max - count));
    }
    if (count > spec.max) {
      if (name === 'ai') this.log.warn(`AI rate limit hit from ${req.ip}`);
      reply.header('Retry-After', spec.windowSec - (Math.floor(Date.now() / 1000) % spec.windowSec));
      fail(429, spec.message);
    }
  }
}
