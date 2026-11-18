import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { fail } from '../common/http.js';
import { DB, type Database } from '../core/tokens.js';
import {
  groceryCoverage, grocerySnapshotLines, grocerySnapshots, householdMembers, householdPantryDefaults, mealPlans, mealSlots, plannerActivities, recipes, recipeVersions,
} from '../db/schema.js';
import { aggregateRequirements, DEFAULT_PANTRY, effectivePantry, ingredientKey, unitInfo, type LineStatus, type SlotRequirement } from './grocery.js';
import { recipeStructureIssues } from './recipe-structure.js';

export interface CreateSnapshotInput {
  planId: string;
  scope: 'week' | 'day';
  /** Required for `day` scope. */
  date?: string;
  /** “Today” in the household's timezone; `week` scope covers the remaining plan from this date. */
  referenceDate: string;
  /** Explicitly buy again for days another active list already covers. */
  override?: boolean;
  budgetPaise?: number;
  freshnessMode?: 'split' | 'all_now';
}

export interface UpdateLineInput {
  status?: LineStatus;
  quantity?: number;
  unit?: string;
  productNote?: string | null;
  estimatedPricePaise?: number | null;
}

type Snapshot = typeof grocerySnapshots.$inferSelect;

@Injectable()
export class GroceryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async role(householdId: string, userId: string) {
    const [member] = await this.db.select({ role: householdMembers.role }).from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))).limit(1);
    if (!member) fail(403, 'You are not a member of this KitchenCircle household.');
    return member.role;
  }

  private async editor(householdId: string, userId: string) {
    const role = await this.role(householdId, userId);
    if (role === 'cook') fail(403, 'Cook members cannot change the household grocery list.');
    return role;
  }

  private async snapshotFor(userId: string, snapshotId: string, mode: 'read' | 'edit') {
    const [snapshot] = await this.db.select().from(grocerySnapshots).where(eq(grocerySnapshots.id, snapshotId)).limit(1);
    if (!snapshot) fail(404, 'Grocery list not found.');
    if (mode === 'read') await this.role(snapshot.householdId, userId);
    else {
      await this.editor(snapshot.householdId, userId);
      if (snapshot.status !== 'draft') fail(409, `This grocery list is ${snapshot.status} and can no longer be changed.`);
    }
    return snapshot;
  }

  private async activity(snapshot: Snapshot, actorUserId: string, eventType: string, after: Record<string, unknown>) {
    await this.db.insert(plannerActivities).values({ householdId: snapshot.householdId, planId: snapshot.planId, actorUserId, eventType, after: { snapshotId: snapshot.id, ...after } });
  }

  async getPantry(userId: string, householdId: string) {
    await this.role(householdId, userId);
    const overrides = await this.db.select().from(householdPantryDefaults).where(eq(householdPantryDefaults.householdId, householdId));
    return { defaults: [...DEFAULT_PANTRY], overrides, items: [...effectivePantry(overrides)].sort() };
  }

  async setPantryItem(userId: string, householdId: string, name: string, inPantry: boolean) {
    await this.editor(householdId, userId);
    const canonicalName = ingredientKey(name);
    await this.db.insert(householdPantryDefaults).values({ householdId, canonicalName, inPantry, updatedByUserId: userId })
      .onConflictDoUpdate({ target: [householdPantryDefaults.householdId, householdPantryDefaults.canonicalName], set: { inPantry, updatedByUserId: userId, updatedAt: new Date() } });
    await this.db.insert(plannerActivities).values({ householdId, actorUserId: userId, eventType: 'pantry_updated', after: { canonicalName, inPantry } });
    return this.getPantry(userId, householdId);
  }

  /** Builds an immutable requirement from the plan's bound recipe versions and claims the covered days. */
  async createSnapshot(userId: string, householdId: string, input: CreateSnapshotInput) {
    await this.editor(householdId, userId);
    const [plan] = await this.db.select().from(mealPlans).where(and(eq(mealPlans.id, input.planId), eq(mealPlans.householdId, householdId))).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    if (input.scope === 'day' && !input.date) fail(400, 'Choose a day for a single-day grocery list.');

    const rows = await this.db
      .select({ slot: mealSlots, version: recipeVersions, recipe: recipes })
      .from(mealSlots)
      .leftJoin(recipeVersions, eq(recipeVersions.id, mealSlots.recipeVersionId))
      .leftJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
      .where(eq(mealSlots.planId, plan.id))
      .orderBy(asc(mealSlots.plannedFor));
    const inScope = rows.filter(({ slot }) => input.scope === 'day' ? slot.plannedFor === input.date : slot.plannedFor >= input.referenceDate);

    const excluded: Array<{ slotId: string; plannedFor: string; reason: string }> = [];
    const included: SlotRequirement[] = [];
    for (const { slot, version, recipe } of inScope) {
      const exclude = (reason: string) => excluded.push({ slotId: slot.id, plannedFor: slot.plannedFor, reason });
      if (slot.state === 'leftovers' || slot.state === 'no_cook' || slot.state === 'household_out') exclude('No cooking planned.');
      else if (!version || !recipe) exclude(slot.mealTitle ? 'Meal has no structured recipe.' : 'No meal planned.');
      else if (!version.approvedAt || recipeStructureIssues(version).length) exclude('Recipe is not grocery-ready.');
      else included.push({
        slotId: slot.id, plannedFor: slot.plannedFor, servings: slot.servings, recipeId: recipe.id, recipeTitle: recipe.title,
        recipeVersionId: version.id, defaultServings: version.defaultServings, ingredients: version.ingredients,
      });
    }
    if (!included.length) fail(422, 'No days in this range have a grocery-ready recipe.', { excluded });

    const active = await this.activeCoverage(included.map((slot) => slot.slotId));
    if (active.length && !input.override) {
      fail(409, 'Some of these days are already on another grocery list.', { conflicts: active.map((row) => ({ slotId: row.slotId, plannedFor: row.plannedFor, snapshotId: row.snapshotId })) });
    }
    const covered = new Set(active.map((row) => row.slotId));

    const overrides = await this.db.select().from(householdPantryDefaults).where(eq(householdPantryDefaults.householdId, householdId));
    const lines = aggregateRequirements(included, effectivePantry(overrides), input.referenceDate);

    const snapshotId = await this.db.transaction(async (tx) => {
      const [snapshot] = await tx.insert(grocerySnapshots).values({
        householdId, planId: plan.id, scope: input.scope, scopeDate: input.scope === 'day' ? input.date : null, referenceDate: input.referenceDate,
        budgetPaise: input.budgetPaise, freshnessMode: input.freshnessMode ?? 'split', createdByUserId: userId,
      }).returning();
      await tx.insert(grocerySnapshotLines).values(lines.map((line, position) => ({
        snapshotId: snapshot.id, position, canonicalName: line.key, displayName: line.displayName, dimension: line.dimension,
        baseQuantity: line.baseQuantity, quantity: line.quantity, unit: line.unit, originalQuantity: line.quantity, originalUnit: line.unit,
        kind: line.kind, status: line.status, required: line.required, freshnessGroup: line.freshnessGroup, unitConflict: line.unitConflict,
        firstNeededOn: line.firstNeededOn, sources: line.sources as unknown as Array<Record<string, unknown>>,
      })));
      await tx.insert(groceryCoverage).values(included.map((slot) => ({
        snapshotId: snapshot.id, slotId: slot.slotId, plannedFor: slot.plannedFor, recipeVersionId: slot.recipeVersionId, servings: slot.servings, override: covered.has(slot.slotId),
      })));
      await tx.insert(plannerActivities).values({
        householdId, planId: plan.id, actorUserId: userId, eventType: 'grocery_snapshot_created',
        after: { snapshotId: snapshot.id, scope: input.scope, days: included.map((slot) => slot.plannedFor), override: covered.size > 0 },
      });
      return snapshot.id;
    }).catch((error: unknown) => {
      // A concurrent list claimed one of these days between the check and the insert.
      if ((error as { code?: string }).code === '23505') fail(409, 'Some of these days were just added to another grocery list. Reload and try again.');
      throw error;
    });
    return { ...(await this.getSnapshot(userId, snapshotId)), excluded };
  }

  private async activeCoverage(slotIds: string[]) {
    if (!slotIds.length) return [];
    return this.db.select({ slotId: groceryCoverage.slotId, plannedFor: groceryCoverage.plannedFor, snapshotId: groceryCoverage.snapshotId })
      .from(groceryCoverage)
      .where(and(inArray(groceryCoverage.slotId, slotIds), eq(groceryCoverage.override, false), isNull(groceryCoverage.releasedAt)));
  }

  async listSnapshots(userId: string, householdId: string, planId?: string) {
    await this.role(householdId, userId);
    const filters = [eq(grocerySnapshots.householdId, householdId)];
    if (planId) filters.push(eq(grocerySnapshots.planId, planId));
    const snapshots = await this.db.select().from(grocerySnapshots).where(and(...filters)).orderBy(desc(grocerySnapshots.createdAt)).limit(50);
    if (!snapshots.length) return [];
    const coverage = await this.db.select().from(groceryCoverage).where(inArray(groceryCoverage.snapshotId, snapshots.map((snapshot) => snapshot.id)));
    return snapshots.map((snapshot) => ({ ...snapshot, days: coverage.filter((row) => row.snapshotId === snapshot.id).map((row) => row.plannedFor).sort() }));
  }

  /** Snapshot with lines, covered days, totals, and any plan edits made since it was built. */
  async getSnapshot(userId: string, snapshotId: string) {
    const snapshot = await this.snapshotFor(userId, snapshotId, 'read');
    const [lines, coverage] = await Promise.all([
      this.db.select().from(grocerySnapshotLines).where(eq(grocerySnapshotLines.snapshotId, snapshotId)).orderBy(asc(grocerySnapshotLines.position)),
      this.db.select().from(groceryCoverage).where(eq(groceryCoverage.snapshotId, snapshotId)).orderBy(asc(groceryCoverage.plannedFor)),
    ]);
    const live = coverage.length
      ? await this.db.select().from(mealSlots).where(inArray(mealSlots.id, coverage.map((row) => row.slotId)))
      : [];
    const planChanges = coverage.flatMap((row) => {
      const slot = live.find((item) => item.id === row.slotId);
      if (!slot) return [{ slotId: row.slotId, plannedFor: row.plannedFor, reason: 'Day was removed from the plan.' }];
      if (slot.recipeVersionId !== row.recipeVersionId) return [{ slotId: row.slotId, plannedFor: row.plannedFor, reason: 'The meal or recipe changed after this list was made.' }];
      if (slot.servings !== row.servings) return [{ slotId: row.slotId, plannedFor: row.plannedFor, reason: `Servings changed from ${row.servings} to ${slot.servings}.` }];
      return [];
    });
    const buying = lines.filter((line) => line.status === 'buy');
    const estimatedTotalPaise = buying.reduce((sum, line) => sum + (line.estimatedPricePaise ?? 0), 0);
    return {
      snapshot,
      lines,
      coverage,
      planChanges,
      totals: {
        lines: lines.length,
        buy: buying.length,
        buyNow: buying.filter((line) => snapshot.freshnessMode === 'all_now' || line.freshnessGroup === 'buy_now').length,
        buyLater: snapshot.freshnessMode === 'all_now' ? 0 : buying.filter((line) => line.freshnessGroup === 'buy_later').length,
        skippedRequired: lines.filter((line) => line.status === 'skipped' && line.required && line.kind === 'recipe').length,
        estimatedTotalPaise,
        overBudget: snapshot.budgetPaise != null && estimatedTotalPaise > snapshot.budgetPaise,
      },
    };
  }

  async updateSnapshot(userId: string, snapshotId: string, input: { budgetPaise?: number | null; freshnessMode?: 'split' | 'all_now' }) {
    const snapshot = await this.snapshotFor(userId, snapshotId, 'edit');
    await this.db.update(grocerySnapshots).set({ ...input, updatedAt: new Date() }).where(eq(grocerySnapshots.id, snapshotId));
    await this.activity(snapshot, userId, 'grocery_snapshot_updated', input);
    return this.getSnapshot(userId, snapshotId);
  }

  /** Manual add/skip/already-have/product/quantity control. Skipping a required ingredient returns a warning. */
  async updateLine(userId: string, snapshotId: string, lineId: string, input: UpdateLineInput) {
    const snapshot = await this.snapshotFor(userId, snapshotId, 'edit');
    const [line] = await this.db.select().from(grocerySnapshotLines).where(and(eq(grocerySnapshotLines.id, lineId), eq(grocerySnapshotLines.snapshotId, snapshotId))).limit(1);
    if (!line) fail(404, 'Grocery item not found.');
    const changes: Partial<typeof grocerySnapshotLines.$inferInsert> = { updatedAt: new Date() };
    if (input.status) changes.status = input.status;
    if (input.productNote !== undefined) changes.productNote = input.productNote;
    if (input.estimatedPricePaise !== undefined) changes.estimatedPricePaise = input.estimatedPricePaise;
    if (input.quantity !== undefined || input.unit !== undefined) {
      const unit = input.unit ?? line.unit;
      const info = unit ? unitInfo(unit) : null;
      if (!info) fail(422, 'Use a measurable unit such as g, kg, ml, l, or piece.');
      const quantity = input.quantity ?? line.quantity;
      if (quantity == null || !(quantity > 0)) fail(422, 'Quantity must be greater than zero.');
      Object.assign(changes, { quantity, unit: info.unit, dimension: info.dimension, baseQuantity: quantity * info.toBase, manuallyChanged: true });
    }
    const [updated] = await this.db.update(grocerySnapshotLines).set(changes).where(eq(grocerySnapshotLines.id, lineId)).returning();
    await this.activity(snapshot, userId, 'grocery_line_updated', { lineId, canonicalName: line.canonicalName, before: { status: line.status, quantity: line.quantity, unit: line.unit }, after: input });
    const sources = line.sources as Array<{ recipeTitle?: string; plannedFor?: string }>;
    const warning = updated.status === 'skipped' && line.required && line.kind === 'recipe'
      ? `${line.displayName} is required for ${sources.map((source) => `${source.recipeTitle} (${source.plannedFor})`).join(', ')}.`
      : null;
    return { line: updated, warning };
  }

  async addManualLine(userId: string, snapshotId: string, input: { name: string; quantity?: number; unit?: string; productNote?: string }) {
    const snapshot = await this.snapshotFor(userId, snapshotId, 'edit');
    const info = input.unit ? unitInfo(input.unit) : null;
    if (input.unit && !info) fail(422, 'Use a measurable unit such as g, kg, ml, l, or piece.');
    if (input.quantity !== undefined && !info) fail(422, 'Add a unit with the quantity.');
    const [last] = await this.db.select({ position: grocerySnapshotLines.position }).from(grocerySnapshotLines)
      .where(eq(grocerySnapshotLines.snapshotId, snapshotId)).orderBy(desc(grocerySnapshotLines.position)).limit(1);
    const quantity = input.quantity ?? null;
    const [line] = await this.db.insert(grocerySnapshotLines).values({
      snapshotId, position: (last?.position ?? -1) + 1, canonicalName: ingredientKey(input.name), displayName: input.name.trim(),
      dimension: info?.dimension ?? null, quantity, unit: info?.unit ?? null, baseQuantity: quantity !== null && info ? quantity * info.toBase : null,
      kind: 'manual', status: 'buy', required: false, productNote: input.productNote,
    }).returning();
    await this.activity(snapshot, userId, 'grocery_line_added', { lineId: line.id, name: line.displayName });
    return line;
  }

  /** Freezes the list; it can no longer change and keeps its days covered. Owner-only, like checkout. */
  async finalize(userId: string, snapshotId: string) {
    const snapshot = await this.snapshotFor(userId, snapshotId, 'edit');
    if ((await this.role(snapshot.householdId, userId)) !== 'owner') fail(403, 'Only the household owner can finalize a grocery list.');
    await this.db.update(grocerySnapshots).set({ status: 'finalized', finalizedAt: new Date(), finalizedByUserId: userId, updatedAt: new Date() }).where(eq(grocerySnapshots.id, snapshotId));
    await this.activity(snapshot, userId, 'grocery_snapshot_finalized', {});
    return this.getSnapshot(userId, snapshotId);
  }

  /** Abandons a draft and releases its days so a new list can cover them. */
  async discard(userId: string, snapshotId: string) {
    const snapshot = await this.snapshotFor(userId, snapshotId, 'edit');
    await this.db.transaction(async (tx) => {
      await tx.update(grocerySnapshots).set({ status: 'discarded', updatedAt: new Date() }).where(eq(grocerySnapshots.id, snapshotId));
      await tx.update(groceryCoverage).set({ releasedAt: new Date() }).where(and(eq(groceryCoverage.snapshotId, snapshotId), isNull(groceryCoverage.releasedAt)));
    });
    await this.activity(snapshot, userId, 'grocery_snapshot_discarded', {});
    return { discarded: true };
  }
}
