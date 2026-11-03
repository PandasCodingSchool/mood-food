import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { fail } from '../common/http.js';
import { DB, type Database, ENV } from '../core/tokens.js';
import type { Env } from '../config/env.js';
import {
  householdMembers, householdRecipes, householdRules, mealFeedback, mealPlanProposalItems, mealPlanProposals, mealPlans, mealSlots, memberFoodPreferences,
  plannerActivities, recipes, recipeVersions, slotAttendance, slotReactions,
} from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { recipeStructureIssues } from './recipe-structure.js';

/** Contract of the intelligence service's `POST /api/kitchen-circle/autofill`. */
interface ProposedRecipe {
  recipe_id: string; version_id: string; title: string; source: string; score: number; reasons: string[]; breakdown: Record<string, number>;
}
interface AutofillResponse {
  proposals: Array<{ slot_id: string; planned_for: string; servings: number; pick: ProposedRecipe; alternatives: ProposedRecipe[] }>;
  unfilled: Array<{ slot_id: string; planned_for: string; reason: string }>;
  ignored_rules: string[];
  summary: string;
  planner_version: string;
}

const HISTORY_DAYS = 28;

const weekdayOf = (value: string) => (new Date(`${value}T00:00:00.000Z`).getUTCDay() + 6) % 7;
const shiftDays = (value: string, days: number) => {
  const d = new Date(`${value}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Household auto-fill. All ranking lives in the intelligence service; this service only gathers
 * household context, stores proposals for review, and applies exactly what a member accepts.
 */
@Injectable()
export class PlannerService {
  private readonly log = new Logger('KitchenCirclePlanner');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly intelligence: IntelligenceService,
  ) {}

  private async planFor(userId: string, planId: string, mode: 'read' | 'edit') {
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    const [member] = await this.db.select({ role: householdMembers.role }).from(householdMembers)
      .where(and(eq(householdMembers.householdId, plan.householdId), eq(householdMembers.userId, userId))).limit(1);
    if (!member) fail(403, 'You are not a member of this KitchenCircle household.');
    if (mode === 'edit' && member.role === 'cook') fail(403, 'Cook members cannot change the household plan.');
    return plan;
  }

  /** Builds the planner request. `overlay` treats some slots as already holding a recipe (other proposed days). */
  async context(plan: typeof mealPlans.$inferSelect, overlay: Map<string, string> = new Map(), forceBlank: Set<string> = new Set()) {
    const householdId = plan.householdId;
    const [members, preferences, rules, rows] = await Promise.all([
      this.db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId)),
      this.db.select().from(memberFoodPreferences).where(eq(memberFoodPreferences.householdId, householdId)),
      // Recurring rules plus any “just this week” rules for this plan's week.
      this.db.select().from(householdRules).where(and(eq(householdRules.householdId, householdId), eq(householdRules.active, true),
        or(isNull(householdRules.appliesToWeekStart), eq(householdRules.appliesToWeekStart, plan.weekStart)))),
      this.db.select({ slot: mealSlots, recipeId: recipeVersions.recipeId }).from(mealSlots)
        .leftJoin(recipeVersions, eq(recipeVersions.id, mealSlots.recipeVersionId))
        .where(eq(mealSlots.planId, plan.id)).orderBy(asc(mealSlots.plannedFor)),
    ]);
    const slotIds = rows.map(({ slot }) => slot.id);
    const attendance = slotIds.length ? await this.db.select().from(slotAttendance).where(inArray(slotAttendance.slotId, slotIds)) : [];

    // Recent meals from earlier plans (repeat handling) and members' reactions to them.
    const since = shiftDays(plan.weekStart, -HISTORY_DAYS);
    const past = await this.db.select({ slotId: mealSlots.id, plannedFor: mealSlots.plannedFor, recipeId: recipeVersions.recipeId })
      .from(mealSlots)
      .innerJoin(mealPlans, eq(mealPlans.id, mealSlots.planId))
      .innerJoin(recipeVersions, eq(recipeVersions.id, mealSlots.recipeVersionId))
      .where(and(eq(mealPlans.householdId, householdId), gte(mealSlots.plannedFor, since), lt(mealSlots.plannedFor, plan.weekStart)));
    // Post-meal check-ins from the last eight weeks, as recipe + weekday + outcome (no member identities).
    const feedbackRows = await this.db.select({ outcome: mealFeedback.outcome, plannedFor: mealSlots.plannedFor, recipeId: recipeVersions.recipeId })
      .from(mealFeedback)
      .innerJoin(mealSlots, eq(mealSlots.id, mealFeedback.slotId))
      .innerJoin(mealPlans, eq(mealPlans.id, mealSlots.planId))
      .innerJoin(recipeVersions, eq(recipeVersions.id, mealSlots.recipeVersionId))
      .where(and(eq(mealPlans.householdId, householdId), gte(mealSlots.plannedFor, shiftDays(plan.weekStart, -56))));
    const reactions = past.length
      ? await this.db.select().from(slotReactions).where(inArray(slotReactions.slotId, past.map((row) => row.slotId)))
      : [];

    return {
      members: members.map((member) => ({
        user_id: member.userId,
        role: member.role,
        preferences: preferences.filter((p) => p.userId === member.userId).map((p) => ({ strength: p.strength, category: p.category, value: p.value })),
      })),
      rules: rules.filter((rule) => rule.category !== 'absence')
        .map((rule) => ({ weekday: rule.weekday, strength: rule.strength, category: rule.category, constraint: rule.constraint })),
      slots: rows.map(({ slot, recipeId }) => ({
        slot_id: slot.id,
        planned_for: slot.plannedFor,
        weekday: weekdayOf(slot.plannedFor),
        state: forceBlank.has(slot.id) ? 'blank' : overlay.has(slot.id) ? 'planned' : slot.state,
        servings: slot.servings,
        recipe_id: forceBlank.has(slot.id) ? null : overlay.get(slot.id) ?? recipeId ?? null,
        attendance: [
          ...attendance.filter((a) => a.slotId === slot.id).map((a) => ({ user_id: a.userId, status: a.status })),
          // Recurring absence (“Arjun's out on Thursdays”) unless that member said otherwise for this day.
          ...rules.filter((rule) => rule.category === 'absence' && (rule.weekday == null || rule.weekday === weekdayOf(slot.plannedFor)))
            .map((rule) => String((rule.constraint as { user_id?: string }).user_id ?? ''))
            .filter((uid) => uid && !attendance.some((a) => a.slotId === slot.id && a.userId === uid))
            .map((uid) => ({ user_id: uid, status: 'absent' as const })),
        ],
      })),
      recipes: await this.candidateRecipes(householdId),
      history: past.map((row) => ({ recipe_id: row.recipeId, planned_for: row.plannedFor })),
      reactions: reactions.flatMap((reaction) => {
        const row = past.find((item) => item.slotId === reaction.slotId);
        return row ? [{ user_id: reaction.userId, recipe_id: row.recipeId, reaction: reaction.reaction }] : [];
      }),
      feedback: feedbackRows.map((row) => ({ recipe_id: row.recipeId, outcome: row.outcome, weekday: weekdayOf(row.plannedFor) })),
      rows,
    };
  }

  /** Catalog + this household's reviewed recipes, each at its newest grocery-ready version. */
  async candidateRecipes(householdId: string) {
    const visible = await this.db.select().from(recipes).where(or(
      eq(recipes.source, 'catalog'),
      inArray(recipes.id, this.db.select({ id: householdRecipes.recipeId }).from(householdRecipes).where(eq(householdRecipes.householdId, householdId))),
    ));
    const usable = visible.filter((recipe) => recipe.source !== 'ai_draft');
    if (!usable.length) return [];
    const versions = await this.db.select().from(recipeVersions)
      .where(inArray(recipeVersions.recipeId, usable.map((recipe) => recipe.id))).orderBy(desc(recipeVersions.version));
    return usable.flatMap((recipe) => {
      const version = versions.find((v) => v.recipeId === recipe.id && v.approvedAt && recipeStructureIssues(v).length === 0);
      if (!version) return [];
      return [{
        recipe_id: recipe.id, version_id: version.id, title: recipe.title, source: recipe.source, default_servings: version.defaultServings,
        cuisine: version.cuisine, effort: version.effort, freshness_class: version.freshnessClass, prep_minutes: version.prepMinutes,
        cook_minutes: version.cookMinutes, dietary_tags: version.dietaryTags, allergens: version.allergens,
        ingredients: version.ingredients.map((i) => i.canonicalName ?? i.name.trim().toLowerCase()),
      }];
    });
  }

  private async callPlanner(body: Record<string, unknown>): Promise<AutofillResponse> {
    try {
      return await this.intelligence.json<AutofillResponse>('POST', '/api/kitchen-circle/autofill', { body, timeoutMs: this.env.LEARN_TIMEOUT_MS });
    } catch (err) {
      this.log.warn(`autofill failed: ${(err as Error).message}`);
      fail(503, 'Auto-fill is unavailable right now. Your plan has not been changed.');
    }
  }

  private async proposalView(proposalId: string) {
    const [proposal] = await this.db.select().from(mealPlanProposals).where(eq(mealPlanProposals.id, proposalId)).limit(1);
    if (!proposal) fail(404, 'Auto-fill proposal not found.');
    const items = await this.db.select().from(mealPlanProposalItems).where(eq(mealPlanProposalItems.proposalId, proposalId)).orderBy(asc(mealPlanProposalItems.plannedFor));
    return { ...proposal, items };
  }

  /**
   * Proposes recipes for blank, unlocked days (or `slotIds`). `regenerate` uses a new seed and avoids the
   * previous proposal's picks. Supersedes any earlier pending proposal; never changes the plan itself.
   */
  async autofill(userId: string, planId: string, input: { slotIds?: string[]; regenerate?: boolean }) {
    const plan = await this.planFor(userId, planId, 'edit');
    const [previous] = await this.db.select().from(mealPlanProposals)
      .where(and(eq(mealPlanProposals.planId, planId), eq(mealPlanProposals.status, 'pending'))).orderBy(desc(mealPlanProposals.createdAt)).limit(1);
    const previousItems = previous ? await this.db.select().from(mealPlanProposalItems).where(eq(mealPlanProposalItems.proposalId, previous.id)) : [];

    const { rows, ...context } = await this.context(plan);
    const blank = rows.filter(({ slot }) => slot.state === 'blank').map(({ slot }) => slot.id);
    const targets = input.slotIds?.length ? input.slotIds.filter((id) => rows.some(({ slot }) => slot.id === id)) : blank;
    if (!targets.length) fail(422, 'There are no open days to fill. Unlock or clear a day first.');
    const seed = input.regenerate ? Math.floor(Math.random() * 1_000_000) + 1 : 0;
    const exclude = input.regenerate
      ? Object.fromEntries(previousItems.map((item) => [item.slotId, [...item.excludedRecipeIds, item.recipeId]]))
      : {};
    const result = await this.callPlanner({ ...context, target_slot_ids: targets, exclude, seed });

    const proposalId = await this.db.transaction(async (tx) => {
      await tx.update(mealPlanProposals).set({ status: 'superseded', resolvedAt: new Date() })
        .where(and(eq(mealPlanProposals.planId, planId), eq(mealPlanProposals.status, 'pending')));
      const [proposal] = await tx.insert(mealPlanProposals).values({
        planId, householdId: plan.householdId, seed, summary: result.summary, plannerVersion: result.planner_version, createdByUserId: userId,
        unfilled: result.unfilled.map((u) => ({ slotId: u.slot_id, plannedFor: u.planned_for, reason: u.reason })), ignoredRules: result.ignored_rules,
      }).returning();
      if (result.proposals.length) {
        await tx.insert(mealPlanProposalItems).values(result.proposals.map((p) => {
          const slot = rows.find((row) => row.slot.id === p.slot_id)!.slot;
          return {
            proposalId: proposal.id, slotId: p.slot_id, plannedFor: p.planned_for, recipeId: p.pick.recipe_id, recipeVersionId: p.pick.version_id,
            title: p.pick.title, source: p.pick.source, score: p.pick.score, reasons: p.pick.reasons, breakdown: p.pick.breakdown,
            alternatives: p.alternatives as unknown as Array<Record<string, unknown>>, excludedRecipeIds: exclude[p.slot_id] ?? [],
            servings: p.servings, slotUpdatedAt: slot.updatedAt,
          };
        }));
      }
      await tx.insert(plannerActivities).values({
        householdId: plan.householdId, planId, actorUserId: userId, eventType: 'autofill_proposed',
        after: { proposalId: proposal.id, days: result.proposals.map((p) => p.planned_for), regenerate: Boolean(input.regenerate) },
      });
      return proposal.id;
    });
    return this.proposalView(proposalId);
  }

  async latest(userId: string, planId: string) {
    await this.planFor(userId, planId, 'read');
    const [proposal] = await this.db.select().from(mealPlanProposals)
      .where(and(eq(mealPlanProposals.planId, planId), eq(mealPlanProposals.status, 'pending'))).orderBy(desc(mealPlanProposals.createdAt)).limit(1);
    return proposal ? this.proposalView(proposal.id) : null;
  }

  private async pendingProposal(planId: string, proposalId: string) {
    const [proposal] = await this.db.select().from(mealPlanProposals)
      .where(and(eq(mealPlanProposals.id, proposalId), eq(mealPlanProposals.planId, planId))).limit(1);
    if (!proposal) fail(404, 'Auto-fill proposal not found.');
    if (proposal.status !== 'pending') fail(409, `This proposal was already ${proposal.status}.`);
    return proposal;
  }

  /**
   * Applies the selected days (default: all still proposed) with optional serving edits. A day that was edited,
   * filled, or locked after the proposal is marked stale and left untouched.
   */
  async apply(userId: string, planId: string, proposalId: string, input: { itemIds?: string[]; servings?: Record<string, number> }) {
    const plan = await this.planFor(userId, planId, 'edit');
    const proposal = await this.pendingProposal(planId, proposalId);
    const items = await this.db.select().from(mealPlanProposalItems)
      .where(and(eq(mealPlanProposalItems.proposalId, proposalId), eq(mealPlanProposalItems.status, 'proposed')));
    const chosen = input.itemIds ? items.filter((item) => input.itemIds!.includes(item.id)) : items;
    if (!chosen.length) fail(422, 'Choose at least one proposed day to apply.');
    const ownRecipes = new Set((await this.db.select({ id: householdRecipes.recipeId }).from(householdRecipes)
      .where(eq(householdRecipes.householdId, plan.householdId))).map((row) => row.id));

    const applied: string[] = [];
    const stale: Array<{ itemId: string; plannedFor: string; reason: string }> = [];
    await this.db.transaction(async (tx) => {
      for (const item of chosen) {
        const [slot] = await tx.select().from(mealSlots).where(eq(mealSlots.id, item.slotId)).for('update').limit(1);
        const [version] = await tx.select({ version: recipeVersions, source: recipes.source }).from(recipeVersions)
          .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId)).where(eq(recipeVersions.id, item.recipeVersionId)).limit(1);
        const reason = !slot ? 'Day was removed.'
          : slot.state !== 'blank' || slot.updatedAt.getTime() !== item.slotUpdatedAt.getTime() ? 'This day changed after the proposal.'
            : !version?.version.approvedAt || recipeStructureIssues(version.version).length ? 'The recipe is no longer grocery-ready.'
              : version.source !== 'catalog' && !ownRecipes.has(version.version.recipeId) ? 'The recipe is no longer available to this household.'
                : null;
        if (reason) {
          stale.push({ itemId: item.id, plannedFor: item.plannedFor, reason });
          await tx.update(mealPlanProposalItems).set({ status: 'stale', updatedAt: new Date() }).where(eq(mealPlanProposalItems.id, item.id));
          continue;
        }
        const servings = input.servings?.[item.id] ?? item.servings;
        await tx.update(mealSlots).set({ recipeVersionId: item.recipeVersionId, mealTitle: item.title, state: 'planned', servings, updatedAt: new Date() })
          .where(eq(mealSlots.id, item.slotId));
        await tx.update(mealPlanProposalItems).set({ status: 'applied', servings, updatedAt: new Date() }).where(eq(mealPlanProposalItems.id, item.id));
        await tx.insert(plannerActivities).values({
          householdId: plan.householdId, planId, slotId: item.slotId, actorUserId: userId, eventType: 'autofill_applied',
          before: { state: slot!.state, recipeVersionId: slot!.recipeVersionId }, after: { proposalId, recipeVersionId: item.recipeVersionId, mealTitle: item.title, servings },
        });
        applied.push(item.id);
      }
      const remaining = items.length - chosen.length;
      if (!remaining) await tx.update(mealPlanProposals).set({ status: 'applied', resolvedAt: new Date() }).where(eq(mealPlanProposals.id, proposal.id));
    });
    return { applied, stale, proposal: await this.proposalView(proposalId) };
  }

  async discard(userId: string, planId: string, proposalId: string) {
    const plan = await this.planFor(userId, planId, 'edit');
    await this.pendingProposal(planId, proposalId);
    await this.db.update(mealPlanProposals).set({ status: 'discarded', resolvedAt: new Date() }).where(eq(mealPlanProposals.id, proposalId));
    await this.db.insert(plannerActivities).values({ householdId: plan.householdId, planId, actorUserId: userId, eventType: 'autofill_discarded', after: { proposalId } });
    return { discarded: true };
  }

  /**
   * Swap one day. With `proposalId` the proposed pick is replaced by the next best recipe (never one already
   * swapped away). Without it, returns read-only alternatives for the day; choosing one uses `PATCH slots/:id/recipe`.
   */
  async swap(userId: string, slotId: string, input: { proposalId?: string }) {
    const [slot] = await this.db.select().from(mealSlots).where(eq(mealSlots.id, slotId)).limit(1);
    if (!slot) fail(404, 'KitchenCircle day slot not found.');
    const plan = await this.planFor(userId, slot.planId, 'edit');
    if (slot.state === 'locked') fail(409, 'This day is locked. Unlock it before changing the plan.');

    if (!input.proposalId) {
      const { rows: _rows, ...context } = await this.context(plan, new Map(), new Set([slotId]));
      const current = slot.recipeVersionId
        ? (await this.db.select({ recipeId: recipeVersions.recipeId }).from(recipeVersions).where(eq(recipeVersions.id, slot.recipeVersionId)).limit(1))[0]?.recipeId
        : undefined;
      const result = await this.callPlanner({ ...context, target_slot_ids: [slotId], exclude: current ? { [slotId]: [current] } : {}, alternatives: 4 });
      const proposal = result.proposals[0];
      return { options: proposal ? [proposal.pick, ...proposal.alternatives] : [], reason: result.unfilled[0]?.reason ?? null };
    }

    await this.pendingProposal(plan.id, input.proposalId);
    const [item] = await this.db.select().from(mealPlanProposalItems)
      .where(and(eq(mealPlanProposalItems.proposalId, input.proposalId), eq(mealPlanProposalItems.slotId, slotId))).limit(1);
    if (!item || item.status !== 'proposed') fail(404, 'This day is not part of the pending proposal.');
    const others = await this.db.select().from(mealPlanProposalItems)
      .where(and(eq(mealPlanProposalItems.proposalId, input.proposalId), eq(mealPlanProposalItems.status, 'proposed')));
    const overlay = new Map(others.filter((other) => other.slotId !== slotId).map((other) => [other.slotId, other.recipeId]));
    const excluded = [...item.excludedRecipeIds, item.recipeId];
    const { rows: _rows, ...context } = await this.context(plan, overlay);
    const result = await this.callPlanner({ ...context, target_slot_ids: [slotId], exclude: { [slotId]: excluded }, seed: 0 });
    const next = result.proposals[0];
    if (!next) fail(422, result.unfilled[0]?.reason ?? 'No other recipe fits this day.');
    const [updated] = await this.db.update(mealPlanProposalItems).set({
      recipeId: next.pick.recipe_id, recipeVersionId: next.pick.version_id, title: next.pick.title, source: next.pick.source, score: next.pick.score,
      reasons: next.pick.reasons, breakdown: next.pick.breakdown, alternatives: next.alternatives as unknown as Array<Record<string, unknown>>,
      excludedRecipeIds: excluded, updatedAt: new Date(),
    }).where(eq(mealPlanProposalItems.id, item.id)).returning();
    return { item: updated };
  }
}
