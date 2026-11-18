import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { RateLimit } from '../common/rate-limit.js';
import { KitchenCircleEnabledGuard } from './feature.guard.js';
import { RecipeAssistService } from './recipe-assist.service.js';

const id = z.uuid();
const generateBody = z.object({ dish: z.string().trim().min(2).max(80), servings: z.number().int().min(1).max(12).optional(), notes: z.string().trim().max(300).nullable().optional() });
const impactBody = z.object({ recipeVersionId: z.uuid() });

/** AI-assisted recipes and the grocery/safety impact of adding or swapping a dish. */
@UseGuards(KitchenCircleEnabledGuard)
@Controller('kitchen-circle')
export class RecipeAssistController {
  constructor(private readonly assist: RecipeAssistService) {}

  // A model call per request: share the per-session signals budget like chat.
  @RateLimit('signals')
  @Post('households/:id/recipes/generate')
  async generate(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string, @Body({ schema: generateBody }) body: z.infer<typeof generateBody>) {
    return { success: true, ...(await this.assist.generate(user.id, householdId, body)) };
  }

  @Post('slots/:id/impact')
  async impact(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) slotId: string, @Body({ schema: impactBody }) body: z.infer<typeof impactBody>) {
    return { success: true, impact: await this.assist.impact(user.id, slotId, body.recipeVersionId) };
  }
}
