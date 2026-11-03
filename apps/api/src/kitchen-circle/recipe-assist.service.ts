import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { fail } from '../common/http.js';
import { DB, type Database, ENV } from '../core/tokens.js';
import type { Env } from '../config/env.js';
import {
  groceryCartProposals, groceryCoverage, grocerySnapshots, householdMembers, householdPantryDefaults, mealPlans, mealSlots, recipes, recipeVersions,
} from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { aggregateRequirements, displayQuantity, effectivePantry, type RequirementLine, type SlotRequirement } from './grocery.js';
import { KitchenCircleService } from './kitchen-circle.service.js';
import { PlannerService } from './planner.service.js';
import { say } from './progress.js';

interface GeneratedRecipe {
  title: string; cuisine: string; effort: 'easy' | 'medium' | 'involved'; freshness_class: 'pantry' | 'fresh' | 'perishable';
  prep_minutes: number; cook_minutes: number; default_servings: number; dietary_tags: string[]; allergens: string[];
  ingredients: Array<{ name: string; quantity: number; unit: string; optional?: boolean }>; steps: string[];
  substitutions: Array<{ ingredient: string; alternatives: string[] }>;
}

export interface ImpactLine { name: string; amount: string }
export interface DishImpact {
  safe: boolean;
  warnings: string[];
  replaces: string | null;
  adds: ImpactLine[];
  needsMore: ImpactLine[];
  reuses: string[];
  noLongerNeeded: ImpactLine[];
  pantry: string[];
  groceryList: { covered: boolean; finalized: boolean; cartStatus: string | null };
  summary: string[];
}

/** Kitchen-friendly amounts: small volumes in spoons, weights and volumes rounded the way people shop. */
export function friendlyAmount(quantity: number, unit: string | null | undefined): string {
  const u = unit ?? '';
  const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);
  const spoons = (n: number) => { const r = Math.round(n * 2) / 2; return Number.isInteger(r) ? String(r) : r < 1 ? '½' : `${Math.floor(r)}½`; };
  if (u === 'ml' && quantity < 15) return `${spoons(quantity / 5)} tsp`;
  if (u === 'ml' && quantity < 100) return `${spoons(quantity / 15)} tbsp`;
  if ((u === 'g' || u === 'ml') && quantity >= 1000) return `${Math.round(quantity / 100) / 10} ${u === 'g' ? 'kg' : 'l'}`;
  if (u === 'g' || u === 'ml') return `${round(quantity, quantity < 50 ? 5 : quantity < 200 ? 10 : 25)} ${u}`;
  return `${Math.round(quantity * 10) / 10} ${u}`.trim();
}
const amount = (line: RequirementLine) => (line.quantity == null ? 'as needed' : friendlyAmount(line.quantity, line.unit));
const lineKey = (line: RequirementLine) => `${line.key}|${line.dimension ?? 'unmeasured'}`;
const listNames = (names: string[], max = 4) => names.length > max ? `${names.slice(0, max).join(', ')} and ${names.length - max} more` : names.join(', ');

/**
 * AI help for recipes and dish changes. Writing recipes is the intelligence service's job; this service supplies the
 * household context, stores results as reviewable drafts, and works out what adding or swapping a dish means for the
 * week's groceries using the same grocery engine as the lists.
 */
@Injectable()
export class RecipeAssistService {
  private readonly log = new Logger('KitchenCircleRecipeAssist');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly intelligence: IntelligenceService,
    private readonly kitchenCircle: KitchenCircleService,
    private readonly planner: PlannerService,
  ) {}

  private knownIngredients: { names: string[]; at: number } | null = null;

  /** Catalog ingredient names, so AI recipes use the same names and merge on the grocery list. Catalog only: never household data. */
  private async ingredientVocabulary(): Promise<string[]> {
    if (this.knownIngredients && Date.now() - this.knownIngredients.at < 3_600_000) return this.knownIngredients.names;
    const rows = await this.db.execute(sql`select distinct lower(i->>'canonicalName') as name from recipe_versions v join recipes r on r.id = v.recipe_id,
      jsonb_array_elements(v.ingredients) i where r.source = 'catalog' and i->>'canonicalName' is not null order by 1`);
    const names = (rows as unknown as { rows?: Array<{ name: string }> }).rows ?? (rows as unknown as Array<{ name: string }>);
    this.knownIngredients = { names: names.map((r) => r.name).filter(Boolean).slice(0, 500), at: Date.now() };
    return this.knownIngredients.names;
  }

  private async member(householdId: string, userId: string) {
    const [member] = await this.db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))).limit(1);
    if (!member) fail(403, 'You are not a member of this KitchenCircle household.');
    return member;
  }

  /** Writes a recipe with AI and stores it as an AI draft: unusable on the plan until a member reviews and approves it. */
  async generate(userId: string, householdId: string, input: { dish: string; servings?: number; notes?: string | null }) {
    const member = await this.member(householdId, userId);
    if (member.role === 'cook') fail(403, 'Cook members cannot create household recipes.');
    // Household limits from the planner's own context (members' preferences and recurring hard rules).
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.householdId, householdId)).orderBy(sql`${mealPlans.weekStart} desc`).limit(1);
    const context = plan ? await this.planner.context(plan) : null;
    const existing = await this.db.select({ id: recipes.id, title: recipes.title, source: recipes.source }).from(recipes)
      .where(and(eq(recipes.source, 'catalog'), sql`lower(${recipes.title}) = ${input.dish.trim().toLowerCase()}`)).limit(1); // catalog only: never reveal other households' private recipes
    let generated: { success: boolean; error?: string; recipe?: GeneratedRecipe; warnings?: string[] };
    say(`Writing a recipe for ${input.dish}`);
    try {
      generated = await this.intelligence.json('POST', '/api/kitchen-circle/recipes/generate', {
        timeoutMs: this.env.AI_TIMEOUT_MS,
        body: { dish: input.dish, servings: input.servings ?? 4, notes: input.notes ?? null, members: context?.members ?? [], rules: context?.rules ?? [],
          known_ingredients: await this.ingredientVocabulary() },
      });
    } catch (err) {
      this.log.warn(`recipe generation unavailable: ${(err as Error).message}`);
      fail(503, 'Recipe writing isn’t available right now. You can still add a recipe yourself.');
    }
    if (!generated.success || !generated.recipe) fail(503, generated.error ?? 'Recipe writing isn’t available right now.');
    const r = generated.recipe;
    say(`Curating the ingredient list for ${r.title}`);
    const created = await this.kitchenCircle.createHouseholdRecipe(userId, householdId, {
      title: r.title, draft: true, defaultServings: r.default_servings,
      ingredients: r.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, ...(i.optional ? { optional: true } : {}) })),
      steps: r.steps, prepMinutes: r.prep_minutes, cookMinutes: r.cook_minutes, cuisine: r.cuisine, effort: r.effort, freshnessClass: r.freshness_class,
      dietaryTags: r.dietary_tags, allergens: r.allergens, substitutions: r.substitutions,
    });
    return { ...created, warnings: generated.warnings ?? [], alreadyHave: existing[0] ?? null };
  }

  /** Is this version safe for everyone eating on that slot's day? (Allergies, diets, never-plan, hard rules — no names.) */
  async fit(slotId: string, recipeVersionId: string): Promise<{ safe: boolean; warnings: string[] }> {
    const [slot] = await this.db.select().from(mealSlots).where(eq(mealSlots.id, slotId)).limit(1);
    const [plan] = slot ? await this.db.select().from(mealPlans).where(eq(mealPlans.id, slot.planId)).limit(1) : [];
    const [row] = await this.db.select({ version: recipeVersions, recipe: recipes }).from(recipeVersions)
      .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId)).where(eq(recipeVersions.id, recipeVersionId)).limit(1);
    if (!slot || !plan || !row) return { safe: true, warnings: [] };
    const context = await this.planner.context(plan);
    const day = context.slots.find((s) => s.slot_id === slotId);
    try {
      return await this.intelligence.json('POST', '/api/kitchen-circle/check-fit', {
        timeoutMs: this.env.LEARN_TIMEOUT_MS,
        body: {
          members: context.members, rules: context.rules, slot: { ...day, state: 'blank' },
          recipe: {
            recipe_id: row.recipe.id, version_id: row.version.id, title: row.recipe.title, source: row.recipe.source === 'ai_draft' ? 'household' : row.recipe.source,
            default_servings: row.version.defaultServings, cuisine: row.version.cuisine, effort: row.version.effort, prep_minutes: row.version.prepMinutes,
            cook_minutes: row.version.cookMinutes, dietary_tags: row.version.dietaryTags, allergens: row.version.allergens,
            ingredients: row.version.ingredients.map((i) => i.canonicalName ?? i.name.toLowerCase()),
          },
        },
      });
    } catch (err) {
      this.log.warn(`fit check unavailable: ${(err as Error).message}`);
      return { safe: true, warnings: ['Couldn’t check allergies and diets right now — check the ingredients yourself.'] };
    }
  }

  /** What putting `recipeVersionId` on this day would change for the week's groceries, and whether it's safe. */
  async impact(userId: string, slotId: string, recipeVersionId: string): Promise<DishImpact> {
    const [slot] = await this.db.select().from(mealSlots).where(eq(mealSlots.id, slotId)).limit(1);
    if (!slot) fail(404, 'KitchenCircle day slot not found.');
    const [plan] = await this.db.select().from(mealPlans).where(eq(mealPlans.id, slot.planId)).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    await this.member(plan.householdId, userId);
    const rows = await this.db.select({ slot: mealSlots, version: recipeVersions, title: recipes.title }).from(mealSlots)
      .leftJoin(recipeVersions, eq(recipeVersions.id, mealSlots.recipeVersionId)).leftJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
      .where(eq(mealSlots.planId, plan.id));
    const [incoming] = await this.db.select({ version: recipeVersions, title: recipes.title }).from(recipeVersions)
      .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId)).where(eq(recipeVersions.id, recipeVersionId)).limit(1);
    if (!incoming) fail(404, 'Recipe version not found.');
    const pantry = effectivePantry(await this.db.select().from(householdPantryDefaults).where(eq(householdPantryDefaults.householdId, plan.householdId)));
    const requirement = (r: { slot: typeof mealSlots.$inferSelect; version: typeof recipeVersions.$inferSelect; title: string }): SlotRequirement => ({
      slotId: r.slot.id, plannedFor: r.slot.plannedFor, servings: r.slot.servings, recipeId: r.version.recipeId, recipeTitle: r.title,
      recipeVersionId: r.version.id, defaultServings: r.version.defaultServings, ingredients: r.version.ingredients,
    });
    const cooking = (state: string) => state === 'planned' || state === 'locked';
    const others = rows.filter((r) => r.slot.id !== slotId && r.version && r.title && cooking(r.slot.state))
      .map((r) => requirement({ slot: r.slot, version: r.version!, title: r.title! }));
    const current = rows.find((r) => r.slot.id === slotId);
    const before = aggregateRequirements([...others, ...(current?.version && current.title && cooking(current.slot.state) ? [requirement({ slot: current.slot, version: current.version, title: current.title })] : [])], pantry, plan.startsOn);
    const after = aggregateRequirements([...others, requirement({ slot, version: incoming.version, title: incoming.title })], pantry, plan.startsOn);
    const beforeBy = new Map(before.map((l) => [lineKey(l), l]));
    const afterBy = new Map(after.map((l) => [lineKey(l), l]));
    const buying = (l: RequirementLine) => l.kind === 'recipe' || l.kind === 'optional';

    const adds = after.filter((l) => buying(l) && l.status === 'buy' && !beforeBy.has(lineKey(l))).map((l) => ({ name: l.displayName, amount: amount(l) }));
    const needsMore = after.filter((l) => buying(l) && beforeBy.has(lineKey(l)) && (l.baseQuantity ?? 0) > (beforeBy.get(lineKey(l))!.baseQuantity ?? 0) + 1e-6)
      .map((l) => {
        const extra = (l.baseQuantity ?? 0) - (beforeBy.get(lineKey(l))!.baseQuantity ?? 0);
        const shown = l.dimension ? displayQuantity(extra, l.dimension) : null;
        return { name: l.displayName, amount: shown ? `+${friendlyAmount(shown.quantity, shown.unit)}` : 'more' };
      });
    const reuses = after.filter((l) => buying(l) && l.sources.some((s) => s.slotId === slotId) && l.sources.some((s) => s.slotId !== slotId)).map((l) => l.displayName);
    const noLongerNeeded = before.filter((l) => buying(l) && !afterBy.has(lineKey(l))).map((l) => ({ name: l.displayName, amount: amount(l) }));
    const pantryUsed = after.filter((l) => l.kind === 'pantry' && l.sources.some((s) => s.slotId === slotId)).map((l) => l.displayName);

    const [coverage] = await this.db.select({ snapshotId: groceryCoverage.snapshotId, status: grocerySnapshots.status }).from(groceryCoverage)
      .innerJoin(grocerySnapshots, eq(grocerySnapshots.id, groceryCoverage.snapshotId))
      .where(and(eq(groceryCoverage.slotId, slotId), isNull(groceryCoverage.releasedAt))).limit(1);
    const carts = coverage ? await this.db.select({ status: groceryCartProposals.status }).from(groceryCartProposals)
      .where(and(eq(groceryCartProposals.snapshotId, coverage.snapshotId), inArray(groceryCartProposals.status, ['cart_written', 'payment_pending', 'ordered']))).limit(1) : [];
    const fit = await this.fit(slotId, recipeVersionId);

    const replaces = current?.slot.mealTitle && current.slot.mealTitle !== incoming.title ? current.slot.mealTitle : null;
    const summary = [
      ...fit.warnings,
      adds.length ? `Adds ${listNames(adds.map((a) => `${a.name} ${a.amount}`))}.` : 'Nothing new to buy.',
      ...(needsMore.length ? [`Needs more ${listNames(needsMore.map((a) => a.name))}.`] : []),
      ...(reuses.length ? [`Uses ${listNames(reuses)} already on this week's list.`] : []),
      ...(noLongerNeeded.length ? [`No longer needed: ${listNames(noLongerNeeded.map((a) => a.name))}.`] : []),
      ...(coverage ? [carts[0] ? 'Groceries for this day were already sent to Instamart — update the cart after this change.' : 'This day is already on a grocery list — rebuild it after this change.'] : []),
    ];
    return {
      safe: fit.safe, warnings: fit.warnings, replaces, adds, needsMore, reuses, noLongerNeeded, pantry: pantryUsed,
      groceryList: { covered: Boolean(coverage), finalized: coverage?.status === 'finalized', cartStatus: carts[0]?.status ?? null }, summary,
    };
  }
}
