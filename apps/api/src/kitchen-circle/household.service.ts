import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { fail } from '../common/http.js';
import type { Env } from '../config/env.js';
import { DB, type Database, ENV } from '../core/tokens.js';
import {
  householdInvites, householdMembers, householdRules, households, mealPlans, mealSlots, memberFoodPreferences, plannerActivities, slotAttendance,
  slotReactions, users,
} from '../db/schema.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const weekdayOf = (value: string) => (new Date(`${value}T00:00:00.000Z`).getUTCDay() + 6) % 7;

/**
 * Household management that completes Phases 1–2: settings, members, invitation management, a member's own
 * preferences, and the per-day “who's eating / what people think” summary. Preferences stay private to their
 * owner; other members only ever see aggregate counts.
 */
@Injectable()
export class HouseholdService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(ENV) private readonly env: Env) {}

  private async member(householdId: string, userId: string) {
    const [member] = await this.db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))).limit(1);
    if (!member) fail(403, 'You are not a member of this KitchenCircle household.');
    return member;
  }

  private async owner(householdId: string, userId: string) {
    const member = await this.member(householdId, userId);
    if (member.role !== 'owner') fail(403, 'Only the household owner can do this.');
    return member;
  }

  private async log(householdId: string, actorUserId: string, eventType: string, after: Record<string, unknown>, before?: Record<string, unknown>) {
    await this.db.insert(plannerActivities).values({ householdId, actorUserId, eventType, after, before });
  }

  async update(userId: string, householdId: string, input: { name?: string; defaultServings?: number; timezone?: string; cookAutoSend?: boolean; designatedCookUserId?: string | null }) {
    await this.owner(householdId, userId);
    if (input.designatedCookUserId) {
      const [cook] = await this.db.select().from(householdMembers)
        .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, input.designatedCookUserId))).limit(1);
      if (cook?.role !== 'cook') fail(422, 'Choose a member of this household who has the Cook role.');
    }
    const [before] = await this.db.select().from(households).where(eq(households.id, householdId)).limit(1);
    const [updated] = await this.db.update(households).set({ ...input, updatedAt: new Date() }).where(eq(households.id, householdId)).returning();
    await this.log(householdId, userId, 'household_updated', input, { name: before?.name, defaultServings: before?.defaultServings, timezone: before?.timezone });
    return updated;
  }

  /** Names and roles only — never preferences, contact details, or MoodFood data. */
  async members(userId: string, householdId: string) {
    await this.member(householdId, userId);
    const rows = await this.db.select({ userId: householdMembers.userId, role: householdMembers.role, joinedAt: householdMembers.joinedAt, name: users.name })
      .from(householdMembers).innerJoin(users, eq(users.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, householdId)).orderBy(asc(householdMembers.joinedAt));
    return rows.map((row) => ({ ...row, name: row.name ?? 'Member', you: row.userId === userId }));
  }

  /** The owner removes a member, or a member/cook leaves. The owner cannot leave their own household. */
  async removeMember(userId: string, householdId: string, memberUserId: string) {
    const actor = await this.member(householdId, userId);
    const target = await this.member(householdId, memberUserId).catch(() => null);
    if (!target) fail(404, 'That person is not in this KitchenCircle.');
    if (target.role === 'owner') fail(409, 'The owner cannot be removed or leave. Transfer isn’t supported yet.');
    if (memberUserId !== userId && actor.role !== 'owner') fail(403, 'Only the household owner can remove members.');
    await this.db.delete(householdMembers).where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, memberUserId)));
    await this.log(householdId, userId, memberUserId === userId ? 'member_left' : 'member_removed', { userId: memberUserId, role: target.role });
    return { removed: true };
  }

  async invites(userId: string, householdId: string) {
    await this.owner(householdId, userId);
    const rows = await this.db.select().from(householdInvites).where(eq(householdInvites.householdId, householdId)).orderBy(desc(householdInvites.createdAt)).limit(50);
    const now = new Date();
    return rows.map(({ token: _token, ...invite }) => ({
      ...invite,
      status: invite.acceptedAt ? 'accepted' : invite.revokedAt ? 'revoked' : invite.expiresAt <= now ? 'expired' : 'pending',
    }));
  }

  /** New token and a fresh 7 days; the old link stops working. Returns the new link once. */
  async resendInvite(userId: string, inviteId: string) {
    const [invite] = await this.db.select().from(householdInvites).where(eq(householdInvites.id, inviteId)).limit(1);
    if (!invite) fail(404, 'Invitation not found.');
    await this.owner(invite.householdId, userId);
    if (invite.acceptedAt) fail(409, 'This invitation was already accepted.');
    const [updated] = await this.db.update(householdInvites).set({ token: randomUUID(), revokedAt: null, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
      .where(eq(householdInvites.id, inviteId)).returning();
    await this.log(invite.householdId, userId, 'invite_resent', { inviteId, email: invite.email, phone: invite.phone, role: invite.role });
    return { ...updated, path: `/kitchen-circle/join/${updated.token}`, url: `${this.env.FRONTEND_ORIGIN.replace(/\/$/, '')}/kitchen-circle/join/${updated.token}` };
  }

  async revokeInvite(userId: string, inviteId: string) {
    const [invite] = await this.db.select().from(householdInvites).where(eq(householdInvites.id, inviteId)).limit(1);
    if (!invite) fail(404, 'Invitation not found.');
    await this.owner(invite.householdId, userId);
    if (invite.acceptedAt) fail(409, 'This invitation was already accepted. Remove the member instead.');
    await this.db.update(householdInvites).set({ revokedAt: invite.revokedAt ?? new Date() }).where(eq(householdInvites.id, inviteId));
    await this.log(invite.householdId, userId, 'invite_revoked', { inviteId });
    return { revoked: true };
  }

  /** The caller's own planning preferences in this household (private to them). */
  async myPreferences(userId: string, householdId: string) {
    await this.member(householdId, userId);
    return this.db.select().from(memberFoodPreferences)
      .where(and(eq(memberFoodPreferences.householdId, householdId), eq(memberFoodPreferences.userId, userId))).orderBy(asc(memberFoodPreferences.createdAt));
  }

  async deletePreference(userId: string, householdId: string, preferenceId: string) {
    await this.member(householdId, userId);
    const deleted = await this.db.delete(memberFoodPreferences)
      .where(and(eq(memberFoodPreferences.id, preferenceId), eq(memberFoodPreferences.householdId, householdId), eq(memberFoodPreferences.userId, userId))).returning();
    if (!deleted.length) fail(404, 'Preference not found.');
    return { deleted: true };
  }

  /**
   * Per day: how many are eating (explicit attendance, then recurring absence rules, defaulting to attending;
   * cooks count only when they mark themselves attending), the caller's own status, and reaction counts.
   */
  async people(userId: string, planId: string) {
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    await this.member(plan.householdId, userId);
    const [members, slots, rules] = await Promise.all([
      this.db.select().from(householdMembers).where(eq(householdMembers.householdId, plan.householdId)),
      this.db.select().from(mealSlots).where(eq(mealSlots.planId, planId)).orderBy(asc(mealSlots.plannedFor)),
      this.db.select().from(householdRules).where(and(eq(householdRules.householdId, plan.householdId), eq(householdRules.active, true), eq(householdRules.category, 'absence'))),
    ]);
    const slotIds = slots.map((s) => s.id);
    const [attendance, reactions] = slotIds.length
      ? await Promise.all([
        this.db.select().from(slotAttendance).where(inArray(slotAttendance.slotId, slotIds)),
        this.db.select().from(slotReactions).where(inArray(slotReactions.slotId, slotIds)),
      ])
      : [[], []];
    return slots.map((slot) => {
      const status = (m: typeof members[number]) => {
        const explicit = attendance.find((a) => a.slotId === slot.id && a.userId === m.userId)?.status;
        if (explicit) return explicit;
        const recurringAway = rules.some((r) => (r.weekday == null || r.weekday === weekdayOf(slot.plannedFor))
          && (!r.appliesToWeekStart || r.appliesToWeekStart === plan.weekStart) && (r.constraint as { user_id?: string }).user_id === m.userId);
        if (recurringAway) return 'absent';
        return m.role === 'cook' ? 'not_eating' : 'attending';
      };
      const statuses = members.map((m) => ({ m, s: status(m) }));
      const eaters = statuses.filter(({ m, s }) => m.role !== 'cook' || s === 'attending');
      const slotReactionsRows = reactions.filter((r) => r.slotId === slot.id);
      return {
        slotId: slot.id,
        eating: eaters.filter(({ s }) => s === 'attending').length,
        people: eaters.length,
        mine: statuses.find(({ m }) => m.userId === userId)?.s ?? null,
        reactions: {
          looksGood: slotReactionsRows.filter((r) => r.reaction === 'looks_good').length,
          notForMe: slotReactionsRows.filter((r) => r.reaction === 'not_for_me').length,
          mine: slotReactionsRows.find((r) => r.userId === userId)?.reaction ?? null,
        },
      };
    });
  }
}
