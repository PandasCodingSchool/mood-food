import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { DB, ENV, type Database } from '../core/tokens.js';
import { swiggyUserTokens } from '../db/schema.js';
import { decrypt, deriveKey, encrypt } from './token-crypto.js';

/** Per-user Swiggy OAuth tokens, encrypted at rest. */
@Injectable()
export class SwiggyTokensService {
  private readonly log = new Logger('SwiggyTokens');
  private key: Buffer | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private getKey() {
    return (this.key ??= deriveKey(this.env.SWIGGY_TOKEN_ENCRYPTION_KEY));
  }

  private async activeRow(userId: string) {
    const [row] = await this.db
      .select()
      .from(swiggyUserTokens)
      .where(and(eq(swiggyUserTokens.userId, userId), eq(swiggyUserTokens.isActive, true)))
      .orderBy(desc(swiggyUserTokens.createdAt))
      .limit(1);
    if (!row || (row.expiresAt && row.expiresAt <= new Date())) return null;
    return row;
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
    if (!row) return null;
    try {
      return decrypt(row.accessTokenEncrypted, this.getKey());
    } catch (err) {
      this.log.error(`Failed to decrypt Swiggy token for ${userId}: ${(err as Error).message}`);
      return null;
    }
  }

  async save(userId: string, token: { user_id?: string; access_token: string; expires_in?: number }) {
    const swiggyUserId = token.user_id || 'unknown';
    const expiresAt = new Date(Date.now() + (token.expires_in || 432000) * 1000);
    const accessTokenEncrypted = encrypt(token.access_token, this.getKey());
    await this.db.transaction(async (tx) => {
      await tx.update(swiggyUserTokens).set({ isActive: false }).where(eq(swiggyUserTokens.userId, userId));
      await tx
        .insert(swiggyUserTokens)
        .values({ userId, swiggyUserId, accessTokenEncrypted, expiresAt })
        .onConflictDoUpdate({
          target: [swiggyUserTokens.userId, swiggyUserTokens.swiggyUserId],
          set: { accessTokenEncrypted, expiresAt, isActive: true, createdAt: new Date() },
        });
    });
  }

  async unlink(userId: string) {
    await this.db.update(swiggyUserTokens).set({ isActive: false }).where(eq(swiggyUserTokens.userId, userId));
  }
}
