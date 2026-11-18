import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { fail } from '../common/http.js';
import { DB, type Database } from '../core/tokens.js';
import { householdMembers, households, mealFeedback, mealPlans, mealSlots, plannerActivities } from '../db/schema.js';

export type FeedbackOutcome = 'loved' | 'change' | 'skipped' | 'moved';

function localDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * Optional post-meal check-in (loved it / change something / skipped / moved it). It is stored per member per
 * day and fed to future auto-fill; it never edits the past plan, grocery lists, or carts.
 */
@Injectable()
export class FeedbackService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(userId: string, slotId: string, input: { outcome: FeedbackOutcome; note?: string | null }) {
    const [slot] = await this.db.select().from(mealSlots).where(eq(mealSlots.id, slotId)).limit(1);
    if (!slot) fail(404, 'KitchenCircle day slot not found.');
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, slot.planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    const [member] = await this.db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, plan.householdId), eq(householdMembers.userId, userId))).limit(1);
    if (!member) fail(403, 'You are not a member of this KitchenCircle household.');
    const [household] = await this.db.select().from(households).where(eq(households.id, plan.householdId)).limit(1);
    if (slot.plannedFor > localDate(household?.timezone ?? 'Asia/Kolkata')) fail(422, 'You can share how it went once the day has come.');
    if (slot.state === 'blank') fail(422, 'Nothing was planned for this day.');
    const [row] = await this.db.insert(mealFeedback).values({ slotId, userId, outcome: input.outcome, note: input.note ?? null })
      .onConflictDoUpdate({ target: [mealFeedback.slotId, mealFeedback.userId], set: { outcome: input.outcome, note: input.note ?? null, updatedAt: new Date() } })
      .returning();
    await this.db.insert(plannerActivities).values({
      householdId: plan.householdId, planId: plan.id, slotId, actorUserId: userId, eventType: 'meal_feedback',
      after: { outcome: input.outcome, recipeVersionId: slot.recipeVersionId },
    });
    return row;
  }

  /** Household feedback for a plan's days, aggregated per day (no member names). */
  async forPlan(userId: string, planId: string) {
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    const [member] = await this.db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, plan.householdId), eq(householdMembers.userId, userId))).limit(1);
    if (!member) fail(403, 'You are not a member of this KitchenCircle household.');
    const slots = await this.db.select({ id: mealSlots.id }).from(mealSlots).where(eq(mealSlots.planId, planId));
    if (!slots.length) return [];
    const rows = await this.db.select().from(mealFeedback).where(inArray(mealFeedback.slotId, slots.map((s) => s.id)));
    return slots.map(({ id }) => {
      const mine = rows.find((r) => r.slotId === id && r.userId === userId);
      const counts = rows.filter((r) => r.slotId === id).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});
      return { slotId: id, mine: mine?.outcome ?? null, counts };
    });
  }
}
