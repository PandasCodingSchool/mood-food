import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import { ENV } from '../core/tokens.js';
import { KitchenCircleEnabledGuard } from './feature.guard.js';
import { HouseholdService } from './household.service.js';

const id = z.uuid();
const updateBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  defaultServings: z.number().int().min(1).max(30).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  cookAutoSend: z.boolean().optional(),
  designatedCookUserId: z.uuid().nullable().optional(),
}).refine((b) => Object.keys(b).length > 0, 'No changes supplied');

/** Unguarded on purpose: the app asks whether to show KitchenCircle at all. */
@Controller('kitchen-circle')
export class KitchenCircleStatusController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Public()
  @Get('status')
  status() {
    return { success: true, enabled: this.env.KITCHEN_CIRCLE_ENABLED };
  }
}

/** Phases 1–2 completion: household settings, members, invitation management, own preferences, day summaries. */
@UseGuards(KitchenCircleEnabledGuard)
@Controller('kitchen-circle')
export class HouseholdController {
  constructor(private readonly households: HouseholdService) {}

  @Patch('households/:id')
  async update(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string, @Body({ schema: updateBody }) body: z.infer<typeof updateBody>) {
    return { success: true, household: await this.households.update(user.id, householdId, body) };
  }

  @Get('households/:id/members')
  async members(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string) {
    return { success: true, members: await this.households.members(user.id, householdId) };
  }

  @Delete('households/:id/members/:userId')
  async removeMember(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string, @Param('userId', { schema: id }) memberUserId: string) {
    return { success: true, ...(await this.households.removeMember(user.id, householdId, memberUserId)) };
  }

  @Get('households/:id/invites')
  async invites(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string) {
    return { success: true, invites: await this.households.invites(user.id, householdId) };
  }

  @Post('invites/:id/resend')
  async resend(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) inviteId: string) {
    return { success: true, invite: await this.households.resendInvite(user.id, inviteId) };
  }

  @Post('invites/:id/revoke')
  async revoke(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) inviteId: string) {
    return { success: true, ...(await this.households.revokeInvite(user.id, inviteId)) };
  }

  @Get('households/:id/preferences/mine')
  async myPreferences(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string) {
    return { success: true, preferences: await this.households.myPreferences(user.id, householdId) };
  }

  @Delete('households/:id/preferences/:preferenceId')
  async deletePreference(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string, @Param('preferenceId', { schema: id }) preferenceId: string) {
    return { success: true, ...(await this.households.deletePreference(user.id, householdId, preferenceId)) };
  }

  @Get('plans/:id/people')
  async people(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) planId: string) {
    return { success: true, days: await this.households.people(user.id, planId) };
  }
}
