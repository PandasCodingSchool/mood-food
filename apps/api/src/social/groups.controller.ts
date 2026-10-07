import { randomInt, randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, Logger, Param, Post, Req } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, Public } from '../auth/auth.guard.js';
import type { AppRequest, AuthUser } from '../auth/auth.types.js';
import { fail, isUniqueViolation } from '../common/http.js';
import { DB, type Database } from '../core/tokens.js';
import { groupMembers, groupSessions } from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
const randomCode = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const code = z.string().trim().min(3).max(20).transform((c) => c.toUpperCase());
const joinBody = z.object({ displayName: z.string().trim().max(100).optional() }).default({});
const swipeBody = z.object({
  memberKey: z.string({ error: 'memberKey and swipes[] are required' }).min(1).max(100),
  swipes: z.array(z.record(z.string(), z.unknown()), { error: 'memberKey and swipes[] are required' }).max(200),
});

/**
 * Group decision lobbies. Poll-based: members join by code, swipe, and any
 * member pulls the maximin consensus from the intelligence service.
 * Guests (no session) can join with a generated member key.
 */
@Controller('groups')
export class GroupsController {
  private readonly log = new Logger('Groups');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly intelligence: IntelligenceService,
  ) {}

  private async group(raw: string) {
    const [g] = await this.db.select().from(groupSessions).where(eq(groupSessions.code, code.parse(raw)));
    return g ?? fail(404, 'Group not found');
  }

  @Post()
  async create(@CurrentUser() user: AuthUser) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const c = randomCode();
      try {
        await this.db.insert(groupSessions).values({ code: c, hostUserId: user.id });
        return { success: true, code: c };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    fail(500, 'Failed to create group');
  }

  @Public()
  @Post(':code/join')
  @HttpCode(200)
  async join(@Param('code') raw: string, @Req() req: AppRequest, @Body({ schema: joinBody }) body: z.infer<typeof joinBody>) {
    const g = await this.group(raw);
    const userId = req.user?.id ?? null;
    const memberKey = userId ?? `guest_${randomUUID().slice(0, 8)}`;
    await this.db
      .insert(groupMembers)
      .values({ groupId: g.id, memberKey, userId, displayName: body.displayName || 'Guest' })
      .onConflictDoNothing();
    return { success: true, memberKey, code: g.code };
  }

  @Public()
  @Get(':code')
  async get(@Param('code') raw: string) {
    const g = await this.group(raw);
    const members = await this.db
      .select({ memberKey: groupMembers.memberKey, displayName: groupMembers.displayName, swipes: groupMembers.swipes })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, g.id));
    return {
      success: true,
      code: g.code,
      status: g.status,
      members: members.map((m) => ({ memberKey: m.memberKey, displayName: m.displayName, swipeCount: m.swipes.length })),
    };
  }

  @Public()
  @Post(':code/swipe')
  @HttpCode(200)
  async swipe(@Param('code') raw: string, @Body({ schema: swipeBody }) body: z.infer<typeof swipeBody>) {
    const g = await this.group(raw);
    const rows = await this.db
      .update(groupMembers)
      .set({ swipes: body.swipes })
      .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.memberKey, body.memberKey)))
      .returning({ memberKey: groupMembers.memberKey });
    if (!rows.length) fail(404, 'Member not found — join the group first');
    return { success: true };
  }

  @Public()
  @Post(':code/consensus')
  @HttpCode(200)
  async consensus(@Param('code') raw: string) {
    const g = await this.group(raw);
    const members = await this.db.select().from(groupMembers).where(eq(groupMembers.groupId, g.id));
    const memberIds = members.flatMap((m) => (m.userId ? [m.userId] : []));
    const guestSwipes = members
      .filter((m) => !m.userId)
      .flatMap((m) => m.swipes.map((s) => ({ ...s, guest_id: m.memberKey })));
    try {
      return await this.intelligence.json('POST', '/api/group/consensus', {
        body: { member_ids: memberIds, guest_swipes: guestSwipes, count: 3 },
        timeoutMs: 30_000,
        sync: true,
      });
    } catch (err) {
      this.log.warn(`consensus failed: ${(err as Error).message}`);
      fail(502, 'Consensus unavailable', { success: false, options: [] });
    }
  }
}
