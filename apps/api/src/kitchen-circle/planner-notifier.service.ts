import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { and, asc, eq, gt, inArray, max, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { DB, type Database, ENV, REDIS } from '../core/tokens.js';
import type { Env } from '../config/env.js';
import {
  groceryCartProposals, groceryCoverage, householdMemberSettings, householdMembers, households, mealPlans, mealSlots,
  plannerActivities, users,
} from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { fail } from '../common/http.js';

export type PlannerNotificationType =
  | 'planner_weekend_nudge' | 'planner_grocery_ready' | 'planner_today_meal' | 'planner_locked_changed'
  | 'planner_day_changed' | 'planner_cart_outdated' | 'planner_invite' | 'planner_cook_menu';

const TICK_MS = 60_000;
const LOCK = 'kc:notifier:lock';
const CURSOR = 'kc:notifier:cursor';
const BATCH = 500;
const DAY_EVENTS = new Set(['slot_updated', 'slot_recipe_selected', 'autofill_applied']);
const LOCK_EVENTS = new Set(['slot_locked', 'slot_unlocked']);
const ROUTE = '/kitchen-circle';
const STATE_TEXT: Record<string, string> = { leftovers: 'leftovers — no cooking needed', no_cook: 'no cooking', household_out: 'no cooking — everyone is eating out', blank: 'nothing planned yet' };

type Member = typeof householdMembers.$inferSelect;
type Household = typeof households.$inferSelect;
type Slot = typeof mealSlots.$inferSelect;

/** The cook who gets the menu: the designated one if they're still a cook here, else the first cook to join. */
export function cookFor(household: Pick<Household, 'cookAutoSend' | 'designatedCookUserId'>, members: Member[], force = false): Member | null {
  if (!household.cookAutoSend && !force) return null;
  const cooks = members.filter((m) => m.role === 'cook').sort((a, b) => +a.joinedAt - +b.joinedAt);
  return cooks.find((m) => m.userId === household.designatedCookUserId) ?? cooks[0] ?? null;
}

/** What the cook's notification says for a day. The tap opens their cook view, with the recipe in their language. */
export function cookMenuMessage(kind: 'tomorrow' | 'today' | 'changed', slot: Pick<Slot, 'plannedFor' | 'state' | 'mealTitle' | 'servings' | 'recipeVersionId'>) {
  const day = weekday(slot.plannedFor);
  const cooking = (slot.state === 'planned' || slot.state === 'locked') && slot.mealTitle;
  const what = cooking ? `${slot.mealTitle} for ${slot.servings}` : STATE_TEXT[slot.state] ?? 'no cooking';
  const recipe = cooking && slot.recipeVersionId ? ' The recipe is ready in your language — tap to open.' : cooking ? ' Tap to see the week.' : '';
  if (kind === 'changed') return { title: `Change for ${day}`, body: `Now: ${what}.${recipe}` };
  return { title: `${kind === 'today' ? 'Today' : 'Tomorrow'}: ${cooking ? slot.mealTitle : what}`, body: `${day}: ${what}.${recipe}` };
}

type Activity = typeof plannerActivities.$inferSelect;
interface Outgoing { userId: string; type: PlannerNotificationType; title: string; body: string; householdId: string }

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
const shift = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const mondayOf = (date: string) => shift(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
const listDays = (days: string[]) => { const names = [...new Set(days)].sort().map(weekday); return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? ''; };

function localClock(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')), weekday: value('weekday') };
}

/**
 * Phase 8 planner notifications on the existing in-app + Expo push system. Change alerts are derived from the
 * planner activity log (no planner write path is touched); weekend and today-meal reminders are scheduled.
 * One instance at a time (Redis lock); members' notification settings are respected; no names or prices for cooks.
 */
@Injectable()
export class PlannerNotifierService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('KitchenCircleNotifier');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick().catch((err) => this.log.warn(`tick failed: ${(err as Error).message}`)), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass: change alerts since the cursor, then scheduled reminders. `force` skips the lock (dev/test trigger). */
  async tick(opts: { now?: Date; force?: boolean } = {}) {
    if (!this.env.KITCHEN_CIRCLE_ENABLED) return { sent: 0 };
    if (!opts.force) {
      const locked = await this.redis.set(LOCK, '1', 'PX', TICK_MS - 5_000, 'NX').catch(() => null);
      if (locked !== 'OK') return { sent: 0 };
    }
    const now = opts.now ?? new Date();
    const out = [...(await this.changeAlerts()), ...(await this.scheduled(now))];
    return { sent: await this.deliver(out) };
  }

  private async changeAlerts(): Promise<Outgoing[]> {
    let cursor = Number(await this.redis.get(CURSOR).catch(() => null));
    if (!cursor) {
      // First run: start from now instead of replaying history.
      const [{ value }] = await this.db.select({ value: max(plannerActivities.id) }).from(plannerActivities);
      await this.redis.set(CURSOR, String(value ?? 0));
      return [];
    }
    const events = await this.db.select().from(plannerActivities).where(gt(plannerActivities.id, cursor)).orderBy(asc(plannerActivities.id)).limit(BATCH);
    if (!events.length) return [];
    cursor = events.at(-1)!.id;
    await this.redis.set(CURSOR, String(cursor));
    return this.fromEvents(events);
  }

  /** Pure-ish fan-out from activity rows; exposed for the lab preview. */
  async fromEvents(events: Activity[]): Promise<Outgoing[]> {
    const out: Outgoing[] = [];
    const householdIds = [...new Set(events.map((e) => e.householdId))];
    const slotIds = [...new Set(events.flatMap((e) => e.slotId ? [e.slotId] : []))];
    const actorIds = [...new Set(events.flatMap((e) => e.actorUserId ? [e.actorUserId] : []))];
    const [members, settings, slots, actors, homes] = await Promise.all([
      householdIds.length ? this.db.select().from(householdMembers).where(inArray(householdMembers.householdId, householdIds)) : [],
      householdIds.length ? this.db.select().from(householdMemberSettings).where(inArray(householdMemberSettings.householdId, householdIds)) : [],
      slotIds.length ? this.db.select().from(mealSlots).where(inArray(mealSlots.id, slotIds)) : [],
      actorIds.length ? this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds)) : [],
      householdIds.length ? this.db.select().from(households).where(inArray(households.id, householdIds)) : [],
    ]);
    const cookOf = (householdId: string) => { const h = homes.find((x) => x.id === householdId); return h ? cookFor(h, members.filter((m) => m.householdId === householdId)) : null; };
    const nameOf = (id: string | null) => actors.find((a) => a.id === id)?.name?.split(' ')[0] ?? 'Someone';
    const wants = (householdId: string, userId: string, key: 'notifyChanges' | 'notifyWeekend' | 'notifyTodayMeal') => {
      const row = settings.find((s) => s.householdId === householdId && s.userId === userId);
      return row ? row[key] : key !== 'notifyTodayMeal';
    };
    const others = (householdId: string, actor: string | null, includeCooks: boolean) =>
      members.filter((m) => m.householdId === householdId && m.userId !== actor && (includeCooks || m.role !== 'cook') && wants(householdId, m.userId, 'notifyChanges'));

    // Day changes: one message per household + actor per tick, listing the days.
    const dayGroups = new Map<string, { householdId: string; actor: string | null; days: string[] }>();
    for (const e of events.filter((e) => DAY_EVENTS.has(e.eventType) && e.slotId)) {
      const slot = slots.find((s) => s.id === e.slotId);
      if (!slot) continue;
      const key = `${e.householdId}|${e.actorUserId}`;
      const group = dayGroups.get(key) ?? { householdId: e.householdId, actor: e.actorUserId, days: [] };
      group.days.push(slot.plannedFor);
      dayGroups.set(key, group);
    }
    // The cook hears about today's and tomorrow's changes as the new menu itself (below), not as a generic alert.
    const cookChanges = new Map<string, Slot>();
    for (const e of events.filter((e) => DAY_EVENTS.has(e.eventType) && e.slotId)) {
      const slot = slots.find((s) => s.id === e.slotId);
      const home = homes.find((h) => h.id === e.householdId);
      const cook = cookOf(e.householdId);
      if (!slot || !home || !cook || cook.userId === e.actorUserId) continue;
      const today = localClock(home.timezone, new Date()).date;
      if (slot.plannedFor === today || slot.plannedFor === shift(today, 1)) cookChanges.set(`${e.householdId}|${slot.id}`, slot);
    }
    for (const [key, slot] of cookChanges) {
      const householdId = key.split('|')[0];
      const cook = cookOf(householdId)!;
      const message = cookMenuMessage('changed', slot);
      out.push({ userId: cook.userId, householdId, type: 'planner_cook_menu', ...message });
    }
    for (const group of dayGroups.values()) {
      // Skip the generic alert for the cook only when every changed day already went to them as the new menu.
      const covered = (date: string) => [...cookChanges.entries()].some(([key, slot]) => key.startsWith(`${group.householdId}|`) && slot.plannedFor === date);
      const cookHasIt = group.days.every(covered);
      for (const m of others(group.householdId, group.actor, true).filter((m) => !(cookHasIt && m.userId === cookOf(group.householdId)?.userId))) {
        out.push({ userId: m.userId, householdId: group.householdId, type: 'planner_day_changed', title: `${listDays(group.days)} changed`, body: `${nameOf(group.actor)} updated the plan for ${listDays(group.days)}.` });
      }
    }
    for (const e of events.filter((e) => LOCK_EVENTS.has(e.eventType) && e.slotId)) {
      const slot = slots.find((s) => s.id === e.slotId);
      if (!slot) continue;
      const locked = e.eventType === 'slot_locked';
      for (const m of others(e.householdId, e.actorUserId, false)) {
        out.push({ userId: m.userId, householdId: e.householdId, type: 'planner_locked_changed', title: `${weekday(slot.plannedFor)} ${locked ? 'is locked' : 'was unlocked'}`,
          body: locked ? `${nameOf(e.actorUserId)} locked ${weekday(slot.plannedFor)}, so it won't change.` : `${nameOf(e.actorUserId)} unlocked ${weekday(slot.plannedFor)}. It can change again.` });
      }
    }
    for (const e of events.filter((e) => e.eventType === 'grocery_snapshot_finalized')) {
      for (const m of others(e.householdId, e.actorUserId, false)) {
        out.push({ userId: m.userId, householdId: e.householdId, type: 'planner_grocery_ready', title: 'Grocery list is ready', body: `${nameOf(e.actorUserId)} finalized the list. Nothing bought twice. Ready when you are.` });
      }
    }
    // A day changed after its groceries went to Instamart: tell the owner the cart may be out of date.
    const changedSlots = events.filter((e) => DAY_EVENTS.has(e.eventType) && e.slotId).map((e) => e.slotId!);
    if (changedSlots.length) {
      const affected = await this.db.selectDistinct({ householdId: groceryCartProposals.householdId, plannedFor: groceryCoverage.plannedFor })
        .from(groceryCoverage)
        .innerJoin(groceryCartProposals, eq(groceryCartProposals.snapshotId, groceryCoverage.snapshotId))
        .where(and(inArray(groceryCoverage.slotId, changedSlots), inArray(groceryCartProposals.status, ['cart_written', 'payment_pending', 'ordered'])));
      const byHousehold = new Map<string, string[]>();
      for (const row of affected) byHousehold.set(row.householdId, [...(byHousehold.get(row.householdId) ?? []), row.plannedFor]);
      for (const [householdId, days] of byHousehold) {
        const owner = members.find((m) => m.householdId === householdId && m.role === 'owner');
        if (owner) out.push({ userId: owner.userId, householdId, type: 'planner_cart_outdated', title: 'Your Instamart cart may be out of date', body: `${listDays(days)} changed after the groceries were sent. Check the cart before you order.` });
      }
    }
    for (const e of events.filter((e) => e.eventType === 'invite_created' || e.eventType === 'invite_resent')) {
      const after = (e.after ?? {}) as { email?: string | null; phone?: string | null };
      const where = after.email ? sql`lower(${users.email}) = ${after.email.toLowerCase()}` : after.phone ? eq(users.phone, after.phone) : null;
      if (!where) continue;
      const [invitee] = await this.db.select({ id: users.id }).from(users).where(where).limit(1);
      if (invitee) out.push({ userId: invitee.id, householdId: e.householdId, type: 'planner_invite', title: "You're invited to a KitchenCircle", body: `${nameOf(e.actorUserId)} wants to plan meals with you. One meal. Everyone in.` });
    }
    return out;
  }

  /** Saturday-morning nudge to plan next week, and the opt-in morning reminder of today's meal. */
  private async scheduled(now: Date): Promise<Outgoing[]> {
    const out: Outgoing[] = [];
    const rows = await this.db.select().from(households);
    for (const household of rows) {
      const clock = localClock(household.timezone, now);
      const members = await this.db.select().from(householdMembers).where(eq(householdMembers.householdId, household.id));
      const settings = await this.db.select().from(householdMemberSettings).where(eq(householdMemberSettings.householdId, household.id));
      const wants = (userId: string, key: 'notifyWeekend' | 'notifyTodayMeal') => {
        const row = settings.find((s) => s.userId === userId);
        return row ? row[key] : key === 'notifyWeekend';
      };
      if (clock.weekday === 'Sat' && clock.hour >= 10 && clock.hour < 20) {
        const nextWeek = shift(mondayOf(clock.date), 7);
        const once = await this.redis.set(`kc:nudge:${household.id}:${nextWeek}`, '1', 'EX', 8 * 86_400, 'NX').catch(() => null);
        if (once === 'OK') {
          const [plan] = await this.db.select().from(mealPlans).where(and(eq(mealPlans.householdId, household.id), eq(mealPlans.weekStart, nextWeek))).limit(1);
          const open = plan ? (await this.db.select().from(mealSlots).where(and(eq(mealSlots.planId, plan.id), eq(mealSlots.state, 'blank')))).length : 7;
          if (open >= 4) {
            for (const m of members.filter((m) => m.role !== 'cook' && wants(m.userId, 'notifyWeekend'))) {
              out.push({ userId: m.userId, householdId: household.id, type: 'planner_weekend_nudge', title: 'Plan next week together', body: `${open} days are still open. Pick a few now and the groceries sort themselves out.` });
            }
          }
        }
      }
      // The cook's menu: tomorrow's in the evening, today's in the morning (each once a day, if anything is planned).
      const cook = cookFor(household, members);
      if (cook && ((clock.hour >= 18 && clock.hour < 22) || (clock.hour >= 7 && clock.hour < 11))) {
        const kind = clock.hour >= 18 ? 'tomorrow' : 'today';
        const date = kind === 'tomorrow' ? shift(clock.date, 1) : clock.date;
        const [row] = await this.db.select({ slot: mealSlots }).from(mealSlots).innerJoin(mealPlans, eq(mealPlans.id, mealSlots.planId))
          .where(and(eq(mealPlans.householdId, household.id), eq(mealSlots.plannedFor, date))).limit(1);
        if (row && row.slot.state !== 'blank') {
          const once = await this.redis.set(`kc:cook:${kind}:${household.id}:${date}`, '1', 'EX', 2 * 86_400, 'NX').catch(() => null);
          if (once === 'OK') out.push({ userId: cook.userId, householdId: household.id, type: 'planner_cook_menu', ...cookMenuMessage(kind, row.slot) });
        }
      }
      if (clock.hour >= 9 && clock.hour < 12) {
        const [slot] = await this.db.select({ slot: mealSlots }).from(mealSlots).innerJoin(mealPlans, eq(mealPlans.id, mealSlots.planId))
          .where(and(eq(mealPlans.householdId, household.id), eq(mealSlots.plannedFor, clock.date))).limit(1);
        const meal = slot?.slot.mealTitle;
        if (meal && (slot.slot.state === 'planned' || slot.slot.state === 'locked')) {
          for (const m of members.filter((m) => wants(m.userId, 'notifyTodayMeal') && m.userId !== cook?.userId)) {
            const once = await this.redis.set(`kc:today:${household.id}:${m.userId}:${clock.date}`, '1', 'EX', 2 * 86_400, 'NX').catch(() => null);
            if (once === 'OK') out.push({ userId: m.userId, householdId: household.id, type: 'planner_today_meal', title: `Today: ${meal}`, body: `${meal} for ${slot.slot.servings}. Today's sorted.` });
          }
        }
      }
    }
    return out;
  }

  /** "Send to cook now": a member pushes one day's menu to the household's cook (even with auto-send off). */
  async sendCookMenu(userId: string, householdId: string, date: string) {
    const members = await this.db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
    const me = members.find((m) => m.userId === userId);
    if (!me) fail(403, 'You are not a member of this KitchenCircle household.');
    if (me.role === 'cook') fail(403, 'Cooks receive the menu; they can’t send it.');
    const [household] = await this.db.select().from(households).where(eq(households.id, householdId)).limit(1);
    const cook = household ? cookFor(household, members, true) : null;
    if (!cook) fail(409, 'Add your cook to the household (Cook role) to send them the menu.');
    const [row] = await this.db.select({ slot: mealSlots }).from(mealSlots).innerJoin(mealPlans, eq(mealPlans.id, mealSlots.planId))
      .where(and(eq(mealPlans.householdId, householdId), eq(mealSlots.plannedFor, date))).limit(1);
    if (!row) fail(404, 'That day isn’t in a plan yet.');
    const today = localClock(household!.timezone, new Date()).date;
    const kind = date === today ? 'today' : date === shift(today, 1) ? 'tomorrow' : 'changed';
    const message = kind === 'changed'
      ? { title: `${weekday(date)}: ${row.slot.mealTitle ?? 'no cooking'}`, body: cookMenuMessage('tomorrow', row.slot).body }
      : cookMenuMessage(kind, row.slot);
    const sent = await this.deliver([{ userId: cook.userId, householdId, type: 'planner_cook_menu', ...message }]);
    const [person] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, cook.userId)).limit(1);
    return { sent: sent > 0, cook: person?.name?.split(' ')[0] ?? 'your cook', title: message.title, body: message.body };
  }

  private async deliver(out: Outgoing[]) {
    let sent = 0;
    const tally = new Map<string, { sent: number; failed: number; types: Record<string, number> }>();
    for (const n of out) {
      const id = await this.notifications.create({ userId: n.userId, type: n.type, title: n.title, body: n.body, data: { householdId: n.householdId, route: ROUTE } });
      const t = tally.get(n.householdId) ?? { sent: 0, failed: 0, types: {} };
      if (id) { t.sent += 1; sent += 1; } else t.failed += 1;
      t.types[n.type] = (t.types[n.type] ?? 0) + 1;
      tally.set(n.householdId, t);
    }
    // Delivery observability, without recursing: the notifier ignores its own event type.
    for (const [householdId, t] of tally) {
      await this.db.insert(plannerActivities).values({ householdId, eventType: 'notifications_sent', after: t });
    }
    return sent;
  }

  /** Example copy for each type, for the Planner Lab notification preview. */
  static previews(): Array<{ type: PlannerNotificationType; title: string; body: string }> {
    return [
      { type: 'planner_weekend_nudge', title: 'Plan next week together', body: '5 days are still open. Pick a few now and the groceries sort themselves out.' },
      { type: 'planner_grocery_ready', title: 'Grocery list is ready', body: 'Asha finalized the list. Nothing bought twice. Ready when you are.' },
      { type: 'planner_today_meal', title: 'Today: Rajma chawal', body: "Rajma chawal for 4. Today's sorted." },
      { type: 'planner_locked_changed', title: 'Thursday is locked', body: "Asha locked Thursday, so it won't change." },
      { type: 'planner_day_changed', title: 'Tuesday and Wednesday changed', body: 'Arjun updated the plan for Tuesday and Wednesday.' },
      { type: 'planner_cook_menu', title: 'Tomorrow: Rajma chawal', body: 'Friday: Rajma chawal for 4. The recipe is ready in your language — tap to open.' },
      { type: 'planner_cart_outdated', title: 'Your Instamart cart may be out of date', body: 'Friday changed after the groceries were sent. Check the cart before you order.' },
      { type: 'planner_invite', title: "You're invited to a KitchenCircle", body: 'Asha wants to plan meals with you. One meal. Everyone in.' },
    ];
  }
}

