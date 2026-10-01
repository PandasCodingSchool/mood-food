import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';
import { ENV } from '../core/tokens.js';
import { fail } from '../common/http.js';
import type { AppRequest, AuthUser } from './auth.types.js';
import { SessionsService } from './sessions.service.js';

type Access = 'user' | 'optional' | 'admin' | 'internal';
const ACCESS = Symbol('ACCESS');

/** No session needed; `req.user` is still attached when a valid token is sent. */
export const Public = () => SetMetadata(ACCESS, 'optional' satisfies Access);
/** Admin role session, or the admin panel's HTTP Basic credentials. */
export const AdminOnly = () => SetMetadata(ACCESS, 'admin' satisfies Access);
/** Service-to-service calls carrying `x-sync-key: $INTELLIGENCE_SYNC_KEY`. */
export const InternalOnly = () => SetMetadata(ACCESS, 'internal' satisfies Access);

/** The signed-in user (non-null on default, session-required routes). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().user;
});

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function readToken(req: AppRequest): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  const legacy = req.headers['x-session-id'];
  return typeof legacy === 'string' && legacy ? legacy.trim() : null;
}

/**
 * Global guard: every route needs a session unless marked @Public,
 * @AdminOnly or @InternalOnly.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const access =
      this.reflector.getAllAndOverride<Access | undefined>(ACCESS, [ctx.getHandler(), ctx.getClass()]) ?? 'user';

    if (access === 'internal') {
      const key = req.headers['x-sync-key'];
      if (!this.env.INTELLIGENCE_SYNC_KEY || typeof key !== 'string' || !safeEqual(key, this.env.INTELLIGENCE_SYNC_KEY)) {
        fail(403, 'Forbidden');
      }
      return true;
    }

    const token = readToken(req);
    const user: AuthUser | null = token ? await this.sessions.resolve(token) : null;
    if (user) req.user = user;

    if (access === 'admin') {
      if (user?.role === 'admin' || this.basicAuthOk(req)) return true;
      fail(401, 'Unauthorized');
    }
    if (access === 'user' && !user) fail(401, token ? 'Session expired. Please log in again.' : 'No session');
    return true;
  }

  private basicAuthOk(req: AppRequest) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Basic ')) return false;
    const expected = Buffer.from(`${this.env.ADMIN_USERNAME}:${this.env.ADMIN_PASSWORD}`).toString('base64');
    return safeEqual(header.slice(6), expected);
  }
}
