import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { and, desc, eq, gt, lte } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { fetchWithTimeout } from '../common/http.js';
import { DB, ENV, REDIS, type Database } from '../core/tokens.js';
import { swiggyUserTokens } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { decrypt, deriveKey, encrypt } from './token-crypto.js';

export const SWIGGY_AUTH_BASE = 'https://mcp.swiggy.com';

/** Swiggy access tokens live 5 days and v1 issues no refresh token; the user re-links. */
const DEFAULT_TTL_SEC = 5 * 24 * 60 * 60;
/** Treat a token as expired this long before Swiggy does (their docs: refresh at ≤ 60s). */
const EXPIRY_SKEW_MS = 60_000;
const REMIND_BEFORE_MS = 12 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;
const LOGOUT_TIMEOUT_MS = 5000;

const notExpired = () => gt(swiggyUserTokens.expiresAt, new Date(Date.now() + EXPIRY_SKEW_MS));

/**
 * Per-user Swiggy OAuth tokens, AES-256-GCM encrypted at rest and bound to
 * the owning user. Tokens never leave the server: the API decrypts them only
 * to forward to the intelligence service. Dead tokens (unlinked, replaced,
 * expired, rejected by Swiggy) are deleted rather than kept around.
 */
@Injectable()
export class SwiggyTokensService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('SwiggyTokens');
  private key: Buffer | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.sweepTimer.unref();
    void this.sweep();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private getKey() {
    return (this.key ??= deriveKey(this.env.SWIGGY_TOKEN_ENCRYPTION_KEY));
  }

  private async activeRow(userId: string) {
    const [row] = await this.db
      .select()
      .from(swiggyUserTokens)
      .where(and(eq(swiggyUserTokens.userId, userId), eq(swiggyUserTokens.isActive, true), notExpired()))
      .orderBy(desc(swiggyUserTokens.createdAt))
      .limit(1);
    return row ?? null;
  }

  private open(row: { userId: string; accessTokenEncrypted: string }): string | null {
    try {
      return decrypt(row.accessTokenEncrypted, this.getKey(), row.userId);
    } catch (err) {
      this.log.error(`Failed to decrypt Swiggy token for ${row.userId}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Link status for /user/me. */
  async info(userId: string) {
    const row = await this.activeRow(userId);
    return {
      swiggyLinked: !!row,
      swiggyUserId: row?.swiggyUserId ?? null,
      swiggyExpiresAt: row?.expiresAt?.toISOString() ?? null,
    };
  }

  /** Decrypted access token, or null when unlinked/expired/undecryptable. */
  async activeToken(userId: string | undefined): Promise<string | null> {
    if (!userId) return null;
    const row = await this.activeRow(userId);
    return row ? this.open(row) : null;
  }

  /** Replaces any earlier link: a user has at most one stored token. */
  async save(userId: string, token: { user_id?: string; access_token: string; expires_in?: number }) {
    const swiggyUserId = token.user_id || 'unknown';
    const expiresAt = new Date(Date.now() + (token.expires_in || DEFAULT_TTL_SEC) * 1000);
    const accessTokenEncrypted = encrypt(token.access_token, this.getKey(), userId);
    await this.db.transaction(async (tx) => {
      await tx.delete(swiggyUserTokens).where(eq(swiggyUserTokens.userId, userId));
      await tx.insert(swiggyUserTokens).values({ userId, swiggyUserId, accessTokenEncrypted, expiresAt });
    });
  }

  /** Revokes the session at Swiggy (best effort), then deletes the stored token. */
  async unlink(userId: string) {
    const token = await this.activeToken(userId);
    await this.db.delete(swiggyUserTokens).where(eq(swiggyUserTokens.userId, userId));
    if (token) await this.revokeAtSwiggy(token);
  }

  /**
   * Swiggy rejected `token` (401/403/419): the user must re-link. Deletes the
   * row only if it still holds that token, so a link made meanwhile survives.
   */
  async discardRejected(userId: string, token: string) {
    const row = await this.activeRow(userId);
    if (!row || this.open(row) !== token) return;
    const deleted = await this.db
      .delete(swiggyUserTokens)
      .where(and(eq(swiggyUserTokens.id, row.id), eq(swiggyUserTokens.accessTokenEncrypted, row.accessTokenEncrypted)))
      .returning({ id: swiggyUserTokens.id });
    if (!deleted.length) return;
    this.log.warn(`Swiggy rejected the token for ${userId}; link removed`);
    await this.notifications.create({
      userId,
      type: 'swiggy',
      title: 'Reconnect Swiggy',
      body: 'Your Swiggy session ended. Reconnect to keep ordering from MoodFood.',
      data: { reason: 'rejected' },
    });
  }

  private async revokeAtSwiggy(token: string) {
    try {
      const res = await fetchWithTimeout(`${SWIGGY_AUTH_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: LOGOUT_TIMEOUT_MS,
      });
      if (!res.ok && res.status !== 401 && res.status !== 419) this.log.warn(`Swiggy logout returned ${res.status}`);
    } catch (err) {
      this.log.warn(`Swiggy logout failed: ${(err as Error).message}`);
    }
  }

  /** Hourly: delete expired tokens and remind users whose link expires soon (once per token, across replicas). */
  async sweep() {
    try {
      await this.db.delete(swiggyUserTokens).where(lte(swiggyUserTokens.expiresAt, new Date(Date.now() + EXPIRY_SKEW_MS)));
      const soon = await this.db
        .select({ id: swiggyUserTokens.id, userId: swiggyUserTokens.userId, expiresAt: swiggyUserTokens.expiresAt })
        .from(swiggyUserTokens)
        .where(and(eq(swiggyUserTokens.isActive, true), lte(swiggyUserTokens.expiresAt, new Date(Date.now() + REMIND_BEFORE_MS))));
      for (const row of soon) {
        const first = await this.redis.set(`swiggy:remind:${row.id}`, '1', 'EX', REMIND_BEFORE_MS / 1000 + 3600, 'NX');
        if (!first) continue;
        await this.notifications.create({
          userId: row.userId,
          type: 'swiggy',
          title: 'Your Swiggy connection expires soon',
          body: 'Swiggy asks you to sign in again every 5 days. Reconnect now to keep one-tap ordering.',
          data: { reason: 'expiring', expiresAt: row.expiresAt?.toISOString() },
        });
      }
    } catch (err) {
      this.log.warn(`Swiggy token sweep failed: ${(err as Error).message}`);
    }
  }
}
