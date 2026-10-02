import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { DB, ENV, REDIS, type Database } from '../core/tokens.js';
import { authSessions, users } from '../db/schema.js';
import type { AuthUser } from './auth.types.js';

const CACHE_TTL_SEC = 300;
const cacheKey = (hash: string) => `sess:${hash}`;
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

export interface IssuedSession {
  token: string;
  expiresAt: string;
}

/**
 * Opaque, revocable bearer sessions. The client keeps the random token; we keep
 * its SHA-256 in Postgres (source of truth) and cache lookups in Redis for 5 min.
 * Accepted as `Authorization: Bearer <token>` or, for v1 clients, `X-Session-Id`.
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(userId: string, meta: { userAgent?: string; ip?: string }): Promise<IssuedSession> {
    const token = `mfs_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * 86_400_000);
    await this.db.insert(authSessions).values({
      userId,
      tokenHash: sha256(token),
      userAgent: meta.userAgent?.slice(0, 500),
      ip: meta.ip?.slice(0, 64),
      expiresAt,
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async resolve(token: string): Promise<AuthUser | null> {
    if (!token.startsWith('mfs_') || token.length > 100) return null;
    const hash = sha256(token);
    const cached = await this.redis.get(cacheKey(hash)).catch(() => null);
    if (cached) return cached === 'x' ? null : (JSON.parse(cached) as AuthUser);

    const [row] = await this.db
      .select({ sessionId: authSessions.id, id: users.id, role: users.role, isGuest: users.isGuest })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .where(and(eq(authSessions.tokenHash, hash), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date())))
      .limit(1);

    // Negative results are cached briefly too, so bad tokens can't hammer Postgres.
    const user: AuthUser | null = row ?? null;
    await this.redis.set(cacheKey(hash), user ? JSON.stringify(user) : 'x', 'EX', user ? CACHE_TTL_SEC : 30).catch(() => {});
    if (user) {
      // Only on cache misses, so at most once per 5 minutes per device.
      const now = new Date();
      await Promise.all([
        this.db.update(authSessions).set({ lastUsedAt: now }).where(eq(authSessions.id, user.sessionId)),
        this.db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id)),
      ]);
    }
    return user;
  }

  list(userId: string) {
    return this.db
      .select({
        id: authSessions.id,
        userAgent: authSessions.userAgent,
        ip: authSessions.ip,
        createdAt: authSessions.createdAt,
        lastUsedAt: authSessions.lastUsedAt,
        expiresAt: authSessions.expiresAt,
      })
      .from(authSessions)
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date())))
      .orderBy(desc(authSessions.lastUsedAt));
  }

  /** Revoke one session (scoped to its owner). Returns false if it wasn't found. */
  async revoke(userId: string, sessionId: string): Promise<boolean> {
    const rows = await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
      .returning({ tokenHash: authSessions.tokenHash });
    await this.evict(rows.map((r) => r.tokenHash));
    return rows.length > 0;
  }

  /** Revoke every session of a user, optionally keeping one (e.g. the current device). */
  async revokeAll(userId: string, exceptSessionId?: string) {
    const rows = await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
          exceptSessionId ? ne(authSessions.id, exceptSessionId) : undefined,
        ),
      )
      .returning({ tokenHash: authSessions.tokenHash });
    await this.evict(rows.map((r) => r.tokenHash));
    return rows.length;
  }

  /** Drop cached lookups for every session of a user (role/guest flag changed). */
  async refreshCache(userId: string) {
    const rows = await this.db
      .select({ tokenHash: authSessions.tokenHash })
      .from(authSessions)
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
    await this.evict(rows.map((r) => r.tokenHash));
  }

  private async evict(hashes: string[]) {
    if (hashes.length) await this.redis.del(...hashes.map(cacheKey)).catch(() => {});
  }
}
