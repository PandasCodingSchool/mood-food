import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseDateOnly } from './calendar.js';
import { KitchenCircleService } from './kitchen-circle.service.js';

const dateOnly = z.string().refine((value) => {
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}, 'Expected a valid YYYY-MM-DD date');

const householdId = z.uuid();
const slotId = z.uuid();
const inviteToken = z.uuid();
const recipeVersionId = z.uuid();
const createHouseholdBody = z.object({
  name: z.string().trim().min(1).max(100).default('My KitchenCircle'),
  defaultServings: z.number().int().min(1).max(30).default(1),
  startsOn: dateOnly,
  timezone: z.string().trim().min(1).max(64).default('Asia/Kolkata'),
});
const updateSlotBody = z
  .object({
    state: z.enum(['blank', 'planned', 'leftovers', 'no_cook', 'household_out']).optional(),
    mealTitle: z.string().trim().min(1).max(255).nullable().optional(),
    servings: z.number().int().min(1).max(30).optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'No changes supplied');
const planQuery = z.object({ weekStart: dateOnly });
const createInviteBody = z.object({ email: z.email().trim().toLowerCase(), role: z.enum(['member', 'cook']).default('member') });
const attendanceBody = z.object({ status: z.enum(['attending', 'absent']) });
const ruleBody = z.object({ weekday: z.number().int().min(0).max(6).optional(), strength: z.enum(['hard', 'preference', 'contextual']), category: z.string().trim().min(1).max(50), constraint: z.record(z.string(), z.unknown()) });
const preferenceBody = z.object({ strength: z.enum(['cannot_eat', 'never_plan', 'prefer_less', 'favourite']), category: z.string().trim().min(1).max(50), value: z.string().trim().min(1).max(255) });
const reactionBody = z.object({ reaction: z.enum(['looks_good', 'not_for_me']), reason: z.string().trim().min(1).max(500).optional() });
const recipeIngredient = z.object({ name: z.string().trim().min(1).max(120), canonicalName: z.string().trim().min(1).max(120).optional(), quantity: z.number().positive().max(100_000), unit: z.string().trim().min(1).max(30), optional: z.boolean().optional() });
const recipeVersionBody = z.object({
  defaultServings: z.number().int().min(1).max(30),
  ingredients: z.array(recipeIngredient).min(1).max(60),
  steps: z.array(z.string().trim().min(1).max(1_000)).min(1).max(40),
  prepMinutes: z.number().int().min(0).max(1_440).optional(),
  cookMinutes: z.number().int().min(0).max(1_440).optional(),
  cuisine: z.string().trim().min(1).max(50).optional(),
  effort: z.enum(['easy', 'medium', 'involved']).optional(),
  freshnessClass: z.enum(['pantry', 'fresh', 'perishable']).optional(),
  dietaryTags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  allergens: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  substitutions: z.array(z.object({ ingredient: z.string().trim().min(1).max(120), alternatives: z.array(z.string().trim().min(1).max(120)).min(1).max(10) })).max(30).optional(),
});
// `draft` marks an unreviewed (AI-generated) recipe; it is unusable until a member approves it.
const recipeBody = recipeVersionBody.extend({ title: z.string().trim().min(1).max(255), draft: z.boolean().optional() });
const recipeQuery = z.object({ q: z.string().trim().max(100).optional(), source: z.enum(['catalog', 'household', 'ai_draft']).optional() });
const selectRecipeBody = z.object({ recipeVersionId: z.uuid() });

@Controller('kitchen-circle')
export class KitchenCircleController {
  constructor(private readonly kitchenCircle: KitchenCircleService) {}

  @Post('households')
  async createHousehold(@CurrentUser() user: AuthUser, @Body({ schema: createHouseholdBody }) body: z.infer<typeof createHouseholdBody>) {
    return { success: true, ...(await this.kitchenCircle.createHousehold(user.id, body)) };
  }

  @Get('households')
  async listHouseholds(@CurrentUser() user: AuthUser) {
    return { success: true, households: await this.kitchenCircle.listHouseholds(user.id) };
  }

  @Get('households/:id/rules')
  async rules(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string) {
    return { success: true, rules: await this.kitchenCircle.getRules(user.id, id) };
  }

  @Post('households/:id/rules')
  async createRule(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Body({ schema: ruleBody }) body: z.infer<typeof ruleBody>) {
    return { success: true, rule: await this.kitchenCircle.createRule(user.id, id, body) };
  }

  @Post('households/:id/invites')
  async createInvite(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: householdId }) id: string,
    @Body({ schema: createInviteBody }) body: z.infer<typeof createInviteBody>,
  ) {
    return { success: true, invite: await this.kitchenCircle.createInvite(user.id, id, body) };
  }

  @Post('invites/:token/accept')
  async acceptInvite(@CurrentUser() user: AuthUser, @Param('token', { schema: inviteToken }) token: string) {
    return { success: true, ...(await this.kitchenCircle.acceptInvite(user.id, token)) };
  }

  @Post('households/:id/plans/next')
  async createNextWeekPlan(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: householdId }) id: string,
    @Body({ schema: z.object({ referenceDate: dateOnly }) }) body: { referenceDate: string },
  ) {
    return { success: true, plan: await this.kitchenCircle.createNextWeekPlan(user.id, id, body.referenceDate) };
  }

  @Get('households/:id/plans')
  async getPlan(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: householdId }) id: string,
    @Query({ schema: planQuery }) query: z.infer<typeof planQuery>,
  ) {
    return { success: true, plan: await this.kitchenCircle.getPlan(user.id, id, query.weekStart) };
  }

  @Get('households/:id/activities')
  async activities(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string) {
    return { success: true, activities: await this.kitchenCircle.getActivities(user.id, id) };
  }

  @Post('households/:id/recipes/:recipeId/versions')
  async createRecipeVersion(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Param('recipeId', { schema: z.uuid() }) recipeId: string, @Body({ schema: recipeVersionBody }) body: z.infer<typeof recipeVersionBody>) {
    return { success: true, version: await this.kitchenCircle.createRecipeVersion(user.id, id, recipeId, body) };
  }

  @Post('households/:id/recipe-versions/:versionId/approve')
  async approveRecipeVersion(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Param('versionId', { schema: recipeVersionId }) versionId: string) {
    return { success: true, version: await this.kitchenCircle.approveRecipeVersion(user.id, id, versionId) };
  }

  @Get('households/:id/recipes')
  async listRecipes(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Query({ schema: recipeQuery }) query: z.infer<typeof recipeQuery>) {
    return { success: true, recipes: await this.kitchenCircle.browseRecipes(user.id, id, query) };
  }

  @Get('households/:id/recipes/:recipeId')
  async getRecipe(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Param('recipeId', { schema: z.uuid() }) recipeId: string) {
    return { success: true, recipe: await this.kitchenCircle.getRecipe(user.id, id, recipeId) };
  }

  @Post('households/:id/recipes')
  async createRecipe(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Body({ schema: recipeBody }) body: z.infer<typeof recipeBody>) {
    return { success: true, ...(await this.kitchenCircle.createHouseholdRecipe(user.id, id, body)) };
  }

  @Get('slots/:id/grocery-eligibility')
  async groceryEligibility(@CurrentUser() user: AuthUser, @Param('id', { schema: slotId }) id: string) {
    return { success: true, ...(await this.kitchenCircle.groceryEligibility(user.id, id)) };
  }

  @Patch('slots/:id/recipe')
  async selectRecipe(@CurrentUser() user: AuthUser, @Param('id', { schema: slotId }) id: string, @Body({ schema: selectRecipeBody }) body: z.infer<typeof selectRecipeBody>) {
    return { success: true, slot: await this.kitchenCircle.selectRecipeForSlot(user.id, id, body.recipeVersionId) };
  }

  @Post('households/:id/preferences')
  async setPreference(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Body({ schema: preferenceBody }) body: z.infer<typeof preferenceBody>) {
    return { success: true, preference: await this.kitchenCircle.setPreference(user.id, id, body) };
  }

  @Post('households/:id/preferences/import-moodfood')
  async importMoodFoodPreferences(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string) {
    return { success: true, ...(await this.kitchenCircle.importMoodFoodPreferences(user.id, id)) };
  }

  @Patch('slots/:id/reaction')
  async react(@CurrentUser() user: AuthUser, @Param('id', { schema: slotId }) id: string, @Body({ schema: reactionBody }) body: z.infer<typeof reactionBody>) {
    return { success: true, reaction: await this.kitchenCircle.reactToSlot(user.id, id, body) };
  }

  @Patch('slots/:id/attendance')
  async setAttendance(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: slotId }) id: string,
    @Body({ schema: attendanceBody }) body: z.infer<typeof attendanceBody>,
  ) {
    return { success: true, attendance: await this.kitchenCircle.setAttendance(user.id, id, body.status) };
  }

  @Patch('slots/:id')
  async updateSlot(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: slotId }) id: string,
    @Body({ schema: updateSlotBody }) body: z.infer<typeof updateSlotBody>,
  ) {
    return { success: true, slot: await this.kitchenCircle.updateSlot(user.id, id, body) };
  }

  @Post('slots/:id/lock')
  async lockSlot(@CurrentUser() user: AuthUser, @Param('id', { schema: slotId }) id: string) {
    return { success: true, slot: await this.kitchenCircle.lockSlot(user.id, id, true) };
  }

  @Post('slots/:id/unlock')
  async unlockSlot(@CurrentUser() user: AuthUser, @Param('id', { schema: slotId }) id: string) {
    return { success: true, slot: await this.kitchenCircle.lockSlot(user.id, id, false) };
  }
}
