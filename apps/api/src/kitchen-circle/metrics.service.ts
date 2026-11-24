import { Inject, Injectable } from '@nestjs/common';
import { and, gte, sql } from 'drizzle-orm';
import { DB, type Database } from '../core/tokens.js';
import {
  groceryCartProposals, groceryCoverage, grocerySnapshots, mealFeedback, mealPlanProposalItems, mealPlanProposals, plannerActionProposals, plannerActivities,
} from '../db/schema.js';

const n = (value: unknown) => Number(value ?? 0);
const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 1000 : null);

/**
 * Phase 9 KitchenCircle observability: one admin read over the planner tables and activity log.
 * Counts only — no household, member, or dish names leave this endpoint.
 */
@Injectable()
export class KitchenCircleMetricsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async summary(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const events = await this.db.select({ type: plannerActivities.eventType, count: sql<number>`count(*)` })
      .from(plannerActivities).where(gte(plannerActivities.createdAt, since)).groupBy(plannerActivities.eventType);
    const ev = (type: string) => n(events.find((e) => e.type === type)?.count);

    const [items] = await this.db.select({
      total: sql<number>`count(*)`,
      applied: sql<number>`count(*) filter (where ${mealPlanProposalItems.status} = 'applied')`,
      stale: sql<number>`count(*) filter (where ${mealPlanProposalItems.status} = 'stale')`,
      swapped: sql<number>`count(*) filter (where jsonb_array_length(${mealPlanProposalItems.excludedRecipeIds}) > 0)`,
    }).from(mealPlanProposalItems).where(gte(mealPlanProposalItems.createdAt, since));
    const proposals = await this.db.select({ status: mealPlanProposals.status, count: sql<number>`count(*)`, unfilled: sql<number>`coalesce(sum(jsonb_array_length(${mealPlanProposals.unfilled})), 0)` })
      .from(mealPlanProposals).where(gte(mealPlanProposals.createdAt, since)).groupBy(mealPlanProposals.status);
    const proposalCount = (status: string) => n(proposals.find((p) => p.status === status)?.count);

    const feedback = await this.db.select({ outcome: mealFeedback.outcome, count: sql<number>`count(*)` })
      .from(mealFeedback).where(gte(mealFeedback.createdAt, since)).groupBy(mealFeedback.outcome);
    const fb = (outcome: string) => n(feedback.find((f) => f.outcome === outcome)?.count);
    const fbTotal = feedback.reduce((sum, f) => sum + n(f.count), 0);

    const [lists] = await this.db.select({ total: sql<number>`count(*)` }).from(grocerySnapshots).where(gte(grocerySnapshots.createdAt, since));
    const [coverage] = await this.db.select({
      days: sql<number>`count(*)`,
      overrides: sql<number>`count(*) filter (where ${groceryCoverage.override})`,
    }).from(groceryCoverage).where(gte(groceryCoverage.createdAt, since));
    const carts = await this.db.select({ status: groceryCartProposals.status, count: sql<number>`count(*)` })
      .from(groceryCartProposals).where(gte(groceryCartProposals.createdAt, since)).groupBy(groceryCartProposals.status);
    const [cartLines] = await this.db.select({
      lines: sql<number>`count(*)`,
      unmatched: sql<number>`count(*) filter (where line->>'status' = 'unmatched')`,
      outOfStock: sql<number>`count(*) filter (where line->>'status' = 'out_of_stock')`,
      unitMismatch: sql<number>`count(*) filter (where line->>'status' = 'unit_mismatch')`,
      avgSurplus: sql<number>`avg((line->'product'->>'surplus_ratio')::float)`,
    }).from(sql`${groceryCartProposals}, jsonb_array_elements(${groceryCartProposals.lines}) as line`)
      .where(and(gte(groceryCartProposals.createdAt, since)));

    const chat = await this.db.select({ status: plannerActionProposals.status, count: sql<number>`count(*)` })
      .from(plannerActionProposals).where(gte(plannerActionProposals.createdAt, since)).groupBy(plannerActionProposals.status);
    const chatCount = (status: string) => n(chat.find((c) => c.status === status)?.count);

    const [delivery] = await this.db.select({
      sent: sql<number>`coalesce(sum((${plannerActivities.after}->>'sent')::int), 0)`,
      failed: sql<number>`coalesce(sum((${plannerActivities.after}->>'failed')::int), 0)`,
    }).from(plannerActivities).where(and(gte(plannerActivities.createdAt, since), sql`${plannerActivities.eventType} = 'notifications_sent'`));

    const lines = n(cartLines?.lines);
    return {
      windowDays: days,
      autofill: {
        proposals: proposals.reduce((sum, p) => sum + n(p.count), 0),
        discarded: proposalCount('discarded'), superseded: proposalCount('superseded'),
        proposedDays: n(items?.total), applied: n(items?.applied), stale: n(items?.stale), swapped: n(items?.swapped),
        acceptanceRate: rate(n(items?.applied), n(items?.total)), swapRate: rate(n(items?.swapped), n(items?.total)),
        unfilledDays: proposals.reduce((sum, p) => sum + n(p.unfilled), 0),
      },
      plannedDayCompletion: {
        checkIns: fbTotal, loved: fb('loved'), change: fb('change'), skipped: fb('skipped'), moved: fb('moved'),
        completionRate: rate(fb('loved') + fb('change'), fbTotal), satisfactionRate: rate(fb('loved'), fbTotal),
      },
      groceries: {
        lists: n(lists?.total), coveredDays: n(coverage?.days), duplicateOverrides: n(coverage?.overrides),
        manualCorrections: ev('grocery_line_updated') + ev('grocery_line_added'),
        carts: Object.fromEntries(carts.map((c) => [c.status, n(c.count)])),
        cartLines: lines, matchFailures: n(cartLines?.unmatched) + n(cartLines?.unitMismatch), stockFailures: n(cartLines?.outOfStock),
        matchFailureRate: rate(n(cartLines?.unmatched) + n(cartLines?.unitMismatch), lines),
        averagePackSurplus: cartLines?.avgSurplus == null ? null : Math.round(Number(cartLines.avgSurplus) * 1000) / 1000,
      },
      cook: { linksCreated: ev('cook_link_created'), linkViews: ev('cook_link_viewed'), translationFailures: ev('translation_failed') },
      notifications: { sent: n(delivery?.sent), failed: n(delivery?.failed) },
      safety: {
        // Attempts the system refused: chat actions rejected/failed by policy or validation, and auto-fill days left
        // empty because every candidate broke a hard rule.
        chatRejected: chatCount('rejected'), chatFailed: chatCount('failed'),
        chatNeedsConfirmation: chatCount('needs_confirmation') + chatCount('confirmed'),
      },
    };
  }
}
