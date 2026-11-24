import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { KitchenCircleEnabledGuard } from './feature.guard.js';
import { PlannerService } from './planner.service.js';

const planId = z.uuid();
const autofillBody = z.object({ slotIds: z.array(z.uuid()).max(14).optional(), regenerate: z.boolean().optional() });
const applyBody = z.object({
  itemIds: z.array(z.uuid()).min(1).max(14).optional(),
  servings: z.record(z.uuid(), z.number().int().min(1).max(30)).optional(),
});
const swapBody = z.object({ proposalId: z.uuid().optional() });

/** Phase 5 auto-fill. Proposals are reviewed first; nothing here changes a day unless a member applies it. */
@UseGuards(KitchenCircleEnabledGuard)
@Controller('kitchen-circle')
export class PlannerController {
  constructor(private readonly planner: PlannerService) {}

  @Post('plans/:id/autofill')
  async autofill(@CurrentUser() user: AuthUser, @Param('id', { schema: planId }) id: string, @Body({ schema: autofillBody }) body: z.infer<typeof autofillBody>) {
    return { success: true, proposal: await this.planner.autofill(user.id, id, body) };
  }

  @Get('plans/:id/proposals/latest')
  async latest(@CurrentUser() user: AuthUser, @Param('id', { schema: planId }) id: string) {
    return { success: true, proposal: await this.planner.latest(user.id, id) };
  }

  @Post('plans/:id/proposals/:proposalId/apply')
  async apply(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: planId }) id: string,
    @Param('proposalId', { schema: z.uuid() }) proposalId: string,
    @Body({ schema: applyBody }) body: z.infer<typeof applyBody>,
  ) {
    return { success: true, ...(await this.planner.apply(user.id, id, proposalId, body)) };
  }

  @Post('plans/:id/proposals/:proposalId/discard')
  async discard(@CurrentUser() user: AuthUser, @Param('id', { schema: planId }) id: string, @Param('proposalId', { schema: z.uuid() }) proposalId: string) {
    return { success: true, ...(await this.planner.discard(user.id, id, proposalId)) };
  }

  @Post('slots/:id/swap')
  async swap(@CurrentUser() user: AuthUser, @Param('id', { schema: z.uuid() }) id: string, @Body({ schema: swapBody }) body: z.infer<typeof swapBody>) {
    return { success: true, ...(await this.planner.swap(user.id, id, body)) };
  }
}
