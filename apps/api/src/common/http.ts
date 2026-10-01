import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Throw an API error with the v1 response shape: `{ error, ...extra }`. */
export function fail(status: number, error: string, extra?: Record<string, unknown>): never {
  throw new HttpException({ error, ...extra }, status);
}

/**
 * Every error leaves the API as `{ error: string, ...extra }` — the shape the
 * mobile app already reads (`data.error`). Unknown errors are logged and
 * masked as 500s.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') return reply.status(status).send({ error: res });
      const body = res as Record<string, unknown>;
      if ('statusCode' in body) {
        // Nest's default shape (validation pipe, NotFoundException, ...).
        const msg = Array.isArray(body.message) ? body.message[0] : body.message;
        return reply.status(status).send({ error: String(msg ?? body.error ?? 'Request failed') });
      }
      return reply.status(status).send(body);
    }

    // Fastify-level errors (body too large, bad JSON, ...) carry a statusCode.
    const statusCode = (exception as { statusCode?: number })?.statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ error: (exception as Error).message });
    }

    this.log.error({ err: exception, reqId: req.id, url: req.url }, 'Unhandled error');
    return reply.status(500).send({ error: 'Something went wrong!' });
  }
}

/** Client IP (honours X-Forwarded-For only when TRUST_PROXY is on — Fastify handles that). */
export const clientIp = (req: FastifyRequest) => req.ip || '';

/** fetch() with an abort deadline. */
export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs: number }) {
  const { timeoutMs, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const isAbort = (err: unknown) => (err as Error)?.name === 'AbortError';

/** Postgres unique_violation, whether raw from pg or wrapped by Drizzle. */
export const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
};
