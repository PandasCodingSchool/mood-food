import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { fail } from '../common/http.js';
import { DB, type Database } from '../core/tokens.js';
import { householdInvites, householdMembers, householdRecipes, householdRules, households, mealPlans, mealSlots, memberFoodPreferences, plannerActivities, recipes, recipeVersions, slotAttendance, slotReactions, users } from '../db/schema.js';
import { nextWeekPeriod, periodForStart, type PlanPeriod } from './calendar.js';
import { PlannerProfileAdapter } from './planner-profile.adapter.js';
import { normalizeIngredients, recipeStructureIssues, type RecipeIngredient } from './recipe-structure.js';

export type HouseholdRole = 'owner' | 'member' | 'cook';
type SlotState = 'blank' | 'planned' | 'locked' | 'leftovers' | 'no_cook' | 'household_out';

export interface CreateHouseholdInput {
  name: string;
  defaultServings: number;
  startsOn: string;
  timezone?: string;
}

export interface UpdateSlotInput {
  state?: SlotState;
  mealTitle?: string | null;
  servings?: number;
  notes?: string | null;
}

export type RecipeSource = 'catalog' | 'household' | 'ai_draft';

export interface RecipeInput {
  defaultServings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  prepMinutes?: number;
  cookMinutes?: number;
  cuisine?: string;
  effort?: 'easy' | 'medium' | 'involved';
  freshnessClass?: 'pantry' | 'fresh' | 'perishable';
  dietaryTags?: string[];
  allergens?: string[];
  substitutions?: Array<{ ingredient: string; alternatives: string[] }>;
}

export interface CreateInviteInput {
  email: string;
  role: Exclude<HouseholdRole, 'owner'>;
}

@Injectable()
export class KitchenCircleService {
  constructor(@Inject(DB) private readonly db: Database, private readonly profileAdapter: PlannerProfileAdapter) {}

  private async membership(householdId: string, userId: string) {
    const [member] = await this.db
      .select()
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
      .limit(1);
    if (!member) fail(403, 'You are not a member of this KitchenCircle household.');
    return member;
  }

  private async planWithSlots(planId: string) {
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    const rows = await this.db
      .select({ slot: mealSlots, recipeId: recipes.id, recipeSource: recipes.source, recipeVersion: recipeVersions.version })
      .from(mealSlots)
      .leftJoin(recipeVersions, eq(recipeVersions.id, mealSlots.recipeVersionId))
      .leftJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
      .where(eq(mealSlots.planId, plan.id))
      .orderBy(asc(mealSlots.plannedFor));
    const slots = rows.map(({ slot, recipeId, recipeSource, recipeVersion }) => ({
      ...slot,
      recipe: recipeId && recipeSource && recipeVersion ? { recipeId, source: recipeSource, version: recipeVersion } : null,
    }));
    return { ...plan, slots };
  }

  private async activity(input: {
    householdId: string; planId?: string; slotId?: string; actorUserId: string; eventType: string;
    before?: Record<string, unknown>; after?: Record<string, unknown>;
  }) {
    await this.db.insert(plannerActivities).values(input);
  }

  async createHousehold(userId: string, input: CreateHouseholdInput) {
    const period = periodForStart(input.startsOn);
    const household = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(households)
        .values({ ownerUserId: userId, name: input.name, defaultServings: input.defaultServings, timezone: input.timezone ?? 'Asia/Kolkata' })
        .returning();
      await tx.insert(householdMembers).values({ householdId: created.id, userId, role: 'owner' });
      const [plan] = await tx
        .insert(mealPlans)
        .values({ householdId: created.id, weekStart: period.weekStart, startsOn: period.startsOn, weekEnd: period.weekEnd })
        .returning();
      await tx.insert(mealSlots).values(period.days.map((plannedFor) => ({ planId: plan.id, plannedFor, servings: input.defaultServings })));
      await tx.insert(plannerActivities).values({
        householdId: created.id,
        planId: plan.id,
        actorUserId: userId,
        eventType: 'household_created',
        after: { name: created.name, defaultServings: created.defaultServings, ...period },
      });
      return { household: created, planId: plan.id };
    });
    return { household: household.household, plan: await this.planWithSlots(household.planId) };
  }

  async listHouseholds(userId: string) {
    return this.db
      .select({ household: households, role: householdMembers.role })
      .from(householdMembers)
      .innerJoin(households, eq(households.id, householdMembers.householdId))
      .where(eq(householdMembers.userId, userId))
      .orderBy(desc(householdMembers.joinedAt));
  }

  async getPlan(userId: string, householdId: string, weekStart: string) {
    await this.membership(householdId, userId);
    const [plan] = await this.db
      .select()
      .from(mealPlans)
      .where(and(eq(mealPlans.householdId, householdId), eq(mealPlans.weekStart, weekStart)))
      .limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    return this.planWithSlots(plan.id);
  }

  /** Creates (or returns) the following Monday–Sunday plan without copying editable meal decisions. */
  async createNextWeekPlan(userId: string, householdId: string, referenceDate: string) {
    const member = await this.membership(householdId, userId);
    if (member.role === 'cook') fail(403, 'Cook members cannot create a household plan.');
    const period = nextWeekPeriod(referenceDate);
    const [existing] = await this.db.select().from(mealPlans)
      .where(and(eq(mealPlans.householdId, householdId), eq(mealPlans.weekStart, period.weekStart))).limit(1);
    if (existing) return this.planWithSlots(existing.id);

    const [household] = await this.db.select().from(households).where(eq(households.id, householdId)).limit(1);
    if (!household) fail(404, 'KitchenCircle household not found.');
    const planId = await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(mealPlans).values({
        householdId, weekStart: period.weekStart, startsOn: period.startsOn, weekEnd: period.weekEnd,
      }).returning();
      await tx.insert(mealSlots).values(period.days.map((plannedFor) => ({
        planId: created.id, plannedFor, servings: household.defaultServings,
      })));
      await tx.insert(plannerActivities).values({
        householdId, planId: created.id, actorUserId: userId, eventType: 'next_week_plan_created', after: { ...period },
      });
      return created.id;
    });
    return this.planWithSlots(planId);
  }

  async createInvite(userId: string, householdId: string, input: CreateInviteInput) {
    const member = await this.membership(householdId, userId);
    if (member.role !== 'owner') fail(403, 'Only the household owner can send invitations.');
    const email = input.email.trim().toLowerCase();
    const [invite] = await this.db.insert(householdInvites).values({
      householdId, invitedByUserId: userId, email, role: input.role,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
    }).returning();
    await this.activity({ householdId, actorUserId: userId, eventType: 'invite_created', after: { email, role: input.role, inviteId: invite.id } });
    return invite;
  }

  async acceptInvite(userId: string, token: string) {
    const [invite] = await this.db.select().from(householdInvites).where(eq(householdInvites.token, token)).limit(1);
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) fail(404, 'KitchenCircle invitation is invalid or expired.');
    const [user] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.email || user.email.toLowerCase() !== invite.email) fail(403, 'Sign in with the email address that received this invitation.');
    await this.db.transaction(async (tx) => {
      await tx.insert(householdMembers).values({ householdId: invite.householdId, userId, role: invite.role }).onConflictDoNothing();
      await tx.update(householdInvites).set({ acceptedAt: new Date(), acceptedByUserId: userId }).where(eq(householdInvites.id, invite.id));
      await tx.insert(plannerActivities).values({
        householdId: invite.householdId, actorUserId: userId, eventType: 'invite_accepted', after: { inviteId: invite.id, role: invite.role },
      });
    });
    return { householdId: invite.householdId, role: invite.role };
  }

  async createRule(userId: string, householdId: string, input: { weekday?: number; strength: 'hard' | 'preference' | 'contextual'; category: string; constraint: Record<string, unknown> }) {
    const member = await this.membership(householdId, userId);
    if (member.role === 'cook') fail(403, 'Cook members cannot change household rules.');
    const [rule] = await this.db.insert(householdRules).values({ householdId, createdByUserId: userId, ...input }).returning();
    await this.activity({ householdId, actorUserId: userId, eventType: 'rule_created', after: { ruleId: rule.id, ...input } });
    return rule;
  }

  async getRules(userId: string, householdId: string) {
    await this.membership(householdId, userId);
    return this.db.select().from(householdRules).where(and(eq(householdRules.householdId, householdId), eq(householdRules.active, true)));
  }

  async getActivities(userId: string, householdId: string) {
    await this.membership(householdId, userId);
    return this.db
      .select()
      .from(plannerActivities)
      .where(eq(plannerActivities.householdId, householdId))
      .orderBy(desc(plannerActivities.createdAt))
      .limit(100);
  }

  /** Catalog recipes are visible to everyone; household/AI-draft recipes only to their owning household. */
  private async accessibleRecipe(householdId: string, recipeId: string) {
    const [recipe] = await this.db.select().from(recipes).where(eq(recipes.id, recipeId)).limit(1);
    if (!recipe) fail(404, 'Recipe not found.');
    if (recipe.source === 'catalog') return { recipe, owned: false };
    const [owned] = await this.db.select().from(householdRecipes)
      .where(and(eq(householdRecipes.householdId, householdId), eq(householdRecipes.recipeId, recipeId))).limit(1);
    if (!owned) fail(404, 'Recipe not found.');
    return { recipe, owned: true };
  }

  private versionView(version: typeof recipeVersions.$inferSelect) {
    const issues = recipeStructureIssues(version);
    return { ...version, structureIssues: issues, groceryReady: Boolean(version.approvedAt) && issues.length === 0 };
  }

  /** Searchable catalog + private household recipes, each summarized by its newest approved version. */
  async browseRecipes(userId: string, householdId: string, query: { q?: string; source?: RecipeSource } = {}) {
    await this.membership(householdId, userId);
    const visible = or(
      eq(recipes.source, 'catalog'),
      inArray(recipes.id, this.db.select({ id: householdRecipes.recipeId }).from(householdRecipes).where(eq(householdRecipes.householdId, householdId))),
    );
    const filters = [visible];
    if (query.q?.trim()) filters.push(ilike(recipes.title, `%${query.q.trim().replace(/[%_\\]/g, '\\$&')}%`));
    if (query.source) filters.push(eq(recipes.source, query.source));
    const rows = await this.db.select().from(recipes).where(and(...filters)).orderBy(asc(recipes.title)).limit(100);
    if (!rows.length) return [];
    const versions = await this.db.select().from(recipeVersions)
      .where(inArray(recipeVersions.recipeId, rows.map((row) => row.id))).orderBy(desc(recipeVersions.version));
    return rows.map((recipe) => {
      const own = versions.filter((version) => version.recipeId === recipe.id);
      const current = own.find((version) => version.approvedAt) ?? own[0];
      const view = current ? this.versionView(current) : null;
      return {
        id: recipe.id,
        title: recipe.title,
        source: recipe.source,
        private: recipe.source !== 'catalog',
        pendingReview: Boolean(own[0] && !own[0].approvedAt),
        currentVersion: view && {
          id: view.id, version: view.version, defaultServings: view.defaultServings, prepMinutes: view.prepMinutes, cookMinutes: view.cookMinutes,
          cuisine: view.cuisine, effort: view.effort, dietaryTags: view.dietaryTags, allergens: view.allergens,
          approved: Boolean(view.approvedAt), groceryReady: view.groceryReady,
        },
      };
    });
  }

  async getRecipe(userId: string, householdId: string, recipeId: string) {
    await this.membership(householdId, userId);
    const { recipe } = await this.accessibleRecipe(householdId, recipeId);
    const versions = await this.db.select().from(recipeVersions).where(eq(recipeVersions.recipeId, recipeId)).orderBy(desc(recipeVersions.version));
    return { ...recipe, private: recipe.source !== 'catalog', versions: versions.map((version) => this.versionView(version)) };
  }

  /**
   * Household-authored recipes must be structurally complete and are usable immediately.
   * AI drafts may be incomplete and stay unusable until a member reviews and approves them.
   */
  async createHouseholdRecipe(userId: string, householdId: string, input: RecipeInput & { title: string; draft?: boolean }) {
    const member = await this.membership(householdId, userId);
    if (member.role === 'cook') fail(403, 'Cook members cannot create household recipes.');
    const draft = Boolean(input.draft);
    const issues = recipeStructureIssues(input);
    if (!draft && issues.length) fail(422, 'This recipe is not structured enough for grocery planning.', { issues });
    return this.db.transaction(async (tx) => {
      const [recipe] = await tx.insert(recipes).values({ title: input.title, source: draft ? 'ai_draft' : 'household', createdByUserId: userId }).returning();
      const [version] = await tx.insert(recipeVersions).values({
        ...this.versionValues(input, draft), recipeId: recipe.id, version: 1, createdByUserId: userId,
        ...(draft ? {} : { approvedAt: new Date(), approvedByUserId: userId }),
      }).returning();
      await tx.insert(householdRecipes).values({ householdId, recipeId: recipe.id });
      await tx.insert(plannerActivities).values({ householdId, actorUserId: userId, eventType: draft ? 'recipe_draft_created' : 'household_recipe_created', after: { recipeId: recipe.id, recipeVersionId: version.id } });
      return { recipe, version: this.versionView(version) };
    });
  }

  /** Edits never mutate a version: they append a new one, so plans and grocery snapshots keep their original. */
  async createRecipeVersion(userId: string, householdId: string, recipeId: string, input: RecipeInput) {
    const member = await this.membership(householdId, userId);
    if (member.role === 'cook') fail(403, 'Cook members cannot create recipe versions.');
    const { recipe, owned } = await this.accessibleRecipe(householdId, recipeId);
    if (!owned) fail(403, 'Catalog recipes cannot be edited. Save a household copy instead.');
    const draft = recipe.source === 'ai_draft';
    const issues = recipeStructureIssues(input);
    if (!draft && issues.length) fail(422, 'This recipe is not structured enough for grocery planning.', { issues });
    const [latest] = await this.db.select().from(recipeVersions).where(eq(recipeVersions.recipeId, recipeId)).orderBy(desc(recipeVersions.version)).limit(1);
    const [version] = await this.db.insert(recipeVersions).values({
      ...this.versionValues(input, draft), recipeId, version: (latest?.version ?? 0) + 1, createdByUserId: userId,
      ...(draft ? {} : { approvedAt: new Date(), approvedByUserId: userId }),
    }).returning();
    await this.activity({ householdId, actorUserId: userId, eventType: 'recipe_version_created', after: { recipeId, recipeVersionId: version.id, version: version.version } });
    return this.versionView(version);
  }

  /** Household review: an approved AI draft becomes an ordinary private household recipe. */
  async approveRecipeVersion(userId: string, householdId: string, recipeVersionId: string) {
    const member = await this.membership(householdId, userId);
    if (member.role === 'cook') fail(403, 'Cook members cannot approve recipes.');
    const [version] = await this.db.select().from(recipeVersions).where(eq(recipeVersions.id, recipeVersionId)).limit(1);
    if (!version) fail(404, 'Recipe version not found.');
    const { owned } = await this.accessibleRecipe(householdId, version.recipeId);
    if (!owned) fail(403, 'This private recipe does not belong to the household.');
    const issues = recipeStructureIssues(version);
    if (issues.length) fail(422, 'Fix the recipe structure before approving it.', { issues });
    const approved = await this.db.transaction(async (tx) => {
      const [updated] = await tx.update(recipeVersions)
        .set({ approvedAt: version.approvedAt ?? new Date(), approvedByUserId: version.approvedByUserId ?? userId, ingredients: normalizeIngredients(version.ingredients) })
        .where(eq(recipeVersions.id, recipeVersionId)).returning();
      await tx.update(recipes).set({ source: 'household' }).where(and(eq(recipes.id, version.recipeId), eq(recipes.source, 'ai_draft')));
      await tx.insert(plannerActivities).values({ householdId, actorUserId: userId, eventType: 'recipe_version_approved', after: { recipeId: version.recipeId, recipeVersionId } });
      return updated;
    });
    return this.versionView(approved);
  }

  private versionValues(input: RecipeInput, draft: boolean) {
    const structured = recipeStructureIssues(input).length === 0;
    return {
      defaultServings: input.defaultServings,
      ingredients: structured ? normalizeIngredients(input.ingredients) : input.ingredients,
      steps: input.steps.map((step) => step.trim()).filter(Boolean),
      prepMinutes: input.prepMinutes, cookMinutes: input.cookMinutes,
      cuisine: input.cuisine, effort: input.effort, freshnessClass: input.freshnessClass,
      dietaryTags: input.dietaryTags ?? [], allergens: input.allergens ?? [], substitutions: input.substitutions ?? [],
      dietaryProvenance: draft ? 'ai' : 'household',
    };
  }

  private async slotContext(slotId: string) {
    const [slot] = await this.db.select().from(mealSlots).where(eq(mealSlots.id, slotId)).limit(1);
    if (!slot) fail(404, 'KitchenCircle day slot not found.');
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, slot.planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    return { slot, plan };
  }

  async groceryEligibility(userId: string, slotId: string) {
    const { slot, plan } = await this.slotContext(slotId);
    await this.membership(plan.householdId, userId);
    if (!slot.recipeVersionId) return { eligible: false, reason: 'Select a structured recipe first.', issues: [] as string[] };
    const [version] = await this.db.select().from(recipeVersions).where(eq(recipeVersions.id, slot.recipeVersionId)).limit(1);
    if (!version) return { eligible: false, reason: 'The selected recipe is no longer available.', issues: [] as string[] };
    const view = this.versionView(version);
    if (!version.approvedAt) return { eligible: false, reason: 'This recipe is waiting for household review.', issues: view.structureIssues };
    return view.groceryReady
      ? { eligible: true, reason: null, issues: [] as string[], recipeVersionId: version.id, servings: slot.servings }
      : { eligible: false, reason: 'Recipe ingredients need measurable quantities and units.', issues: view.structureIssues };
  }

  async selectRecipeForSlot(userId: string, slotId: string, recipeVersionId: string) {
    const { slot, plan } = await this.slotContext(slotId);
    const member = await this.membership(plan.householdId, userId);
    if (member.role === 'cook') fail(403, 'Cook members cannot edit the household plan.');
    if (slot.state === 'locked') fail(409, 'This day is locked. Unlock it before changing the plan.');
    const [version] = await this.db.select().from(recipeVersions).where(eq(recipeVersions.id, recipeVersionId)).limit(1);
    if (!version) fail(404, 'Recipe version not found.');
    const { recipe } = await this.accessibleRecipe(plan.householdId, version.recipeId);
    if (!version.approvedAt || recipeStructureIssues(version).length) fail(422, 'Select an approved recipe with structured ingredients and steps.');
    const [updated] = await this.db.update(mealSlots).set({ recipeVersionId, mealTitle: recipe.title, state: 'planned', updatedAt: new Date() }).where(eq(mealSlots.id, slotId)).returning();
    await this.activity({ householdId: plan.householdId, planId: plan.id, slotId, actorUserId: userId, eventType: 'slot_recipe_selected', before: { recipeVersionId: slot.recipeVersionId, mealTitle: slot.mealTitle }, after: { recipeVersionId, mealTitle: recipe.title } });
    return updated;
  }

  async setPreference(userId: string, householdId: string, input: { strength: 'cannot_eat' | 'never_plan' | 'prefer_less' | 'favourite'; category: string; value: string }) {
    await this.membership(householdId, userId);
    const [preference] = await this.db.insert(memberFoodPreferences).values({ householdId, userId, ...input }).onConflictDoUpdate({ target: [memberFoodPreferences.householdId, memberFoodPreferences.userId, memberFoodPreferences.strength, memberFoodPreferences.category, memberFoodPreferences.value], set: { updatedAt: new Date() } }).returning();
    return preference;
  }

  async importMoodFoodPreferences(userId: string, householdId: string) {
    await this.membership(householdId, userId);
    const preferences = await this.profileAdapter.eligiblePreferences(userId);
    for (const preference of preferences) await this.setPreference(userId, householdId, preference);
    return { imported: preferences.length };
  }

  async reactToSlot(userId: string, slotId: string, input: { reaction: 'looks_good' | 'not_for_me'; reason?: string }) {
    const [slot] = await this.db.select().from(mealSlots).where(eq(mealSlots.id, slotId)).limit(1);
    if (!slot) fail(404, 'KitchenCircle day slot not found.');
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, slot.planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    await this.membership(plan.householdId, userId);
    const [reaction] = await this.db.insert(slotReactions).values({ slotId, userId, ...input }).onConflictDoUpdate({ target: [slotReactions.slotId, slotReactions.userId], set: { ...input, updatedAt: new Date() } }).returning();
    await this.activity({ householdId: plan.householdId, planId: plan.id, slotId, actorUserId: userId, eventType: 'slot_reacted', after: { ...input } });
    return reaction;
  }

  async setAttendance(userId: string, slotId: string, status: 'attending' | 'absent') {
    const [slot] = await this.db.select().from(mealSlots).where(eq(mealSlots.id, slotId)).limit(1);
    if (!slot) fail(404, 'KitchenCircle day slot not found.');
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, slot.planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    await this.membership(plan.householdId, userId);
    const [attendance] = await this.db.insert(slotAttendance).values({ slotId, userId, status })
      .onConflictDoUpdate({ target: [slotAttendance.slotId, slotAttendance.userId], set: { status, updatedAt: new Date() } }).returning();
    await this.activity({ householdId: plan.householdId, planId: plan.id, slotId, actorUserId: userId, eventType: 'attendance_updated', after: { status } });
    return attendance;
  }

  async updateSlot(userId: string, slotId: string, input: UpdateSlotInput) {
    const [slot] = await this.db.select().from(mealSlots).where(eq(mealSlots.id, slotId)).limit(1);
    if (!slot) fail(404, 'KitchenCircle day slot not found.');
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, slot.planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    const member = await this.membership(plan.householdId, userId);
    if (member.role === 'cook') fail(403, 'Cook members cannot edit the household plan.');
    if (slot.state === 'locked') fail(409, 'This day is locked. Unlock it before changing the plan.');

    // A hand-typed meal or non-cooking day no longer matches the bound recipe, so drop the binding.
    const titleChanged = input.mealTitle !== undefined && input.mealTitle !== slot.mealTitle;
    const leftPlanned = input.state !== undefined && input.state !== 'planned';
    const unbind = Boolean(slot.recipeVersionId) && (titleChanged || leftPlanned);
    const [updated] = await this.db
      .update(mealSlots)
      .set({ ...input, ...(unbind ? { recipeVersionId: null } : {}), updatedAt: new Date() })
      .where(eq(mealSlots.id, slotId))
      .returning();
    await this.activity({
      householdId: plan.householdId,
      planId: plan.id,
      slotId,
      actorUserId: userId,
      eventType: 'slot_updated',
      before: { state: slot.state, mealTitle: slot.mealTitle, servings: slot.servings, notes: slot.notes, recipeVersionId: slot.recipeVersionId },
      after: { state: updated.state, mealTitle: updated.mealTitle, servings: updated.servings, notes: updated.notes, recipeVersionId: updated.recipeVersionId },
    });
    return updated;
  }

  async lockSlot(userId: string, slotId: string, locked: boolean) {
    const [slot] = await this.db.select().from(mealSlots).where(eq(mealSlots.id, slotId)).limit(1);
    if (!slot) fail(404, 'KitchenCircle day slot not found.');
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, slot.planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    const member = await this.membership(plan.householdId, userId);
    if (member.role === 'cook') fail(403, 'Cook members cannot lock the household plan.');

    const [updated] = await this.db
      .update(mealSlots)
      .set({ state: locked ? 'locked' : (slot.mealTitle ? 'planned' : 'blank'), lockedAt: locked ? new Date() : null, lockedByUserId: locked ? userId : null, updatedAt: new Date() })
      .where(eq(mealSlots.id, slotId))
      .returning();
    await this.activity({
      householdId: plan.householdId,
      planId: plan.id,
      slotId,
      actorUserId: userId,
      eventType: locked ? 'slot_locked' : 'slot_unlocked',
      before: { state: slot.state },
      after: { state: updated.state },
    });
    return updated;
  }

  /** Public for contract/unit tests; this is the Phase 1 date invariant. */
  periodForStart(startsOn: string): PlanPeriod {
    return periodForStart(startsOn);
  }
}
