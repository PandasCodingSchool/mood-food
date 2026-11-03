import { Body, Controller, Get, NotFoundException, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, CurrentUser, Public } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import { ENV } from '../core/tokens.js';
import { KitchenCircleEnabledGuard } from './feature.guard.js';
import { decide, messageShape, type ChatAction } from './chat-policy.js';
import { COOK_LANGUAGES, CookService } from './cook.service.js';
import { FeedbackService } from './feedback.service.js';
import { aggregateRequirements, effectivePantry } from './grocery.js';
import { KitchenCircleMetricsService } from './metrics.service.js';
import { PlannerNotifierService } from './planner-notifier.service.js';

const id = z.uuid();
const language = z.enum(COOK_LANGUAGES);
const linkBody = z.object({
  planId: z.uuid(), slotId: z.uuid().optional(), language: language.default('en'), transliterate: z.boolean().optional(),
  expiresInDays: z.number().int().min(1).max(14).optional(),
});
const speechBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), part: z.enum(['ingredients', 'step']), index: z.number().int().min(0).max(40).optional(),
  language: language.optional(),
});
const speechKey = z.string().regex(/^[a-f0-9]{64}$/);
const sendMenuBody = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const viewQuery = z.object({ language: language.optional(), transliterate: z.enum(['true', 'false']).optional() });
const tokenParam = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
const feedbackBody = z.object({ outcome: z.enum(['loved', 'change', 'skipped', 'moved']), note: z.string().trim().max(500).nullable().optional() });
const settingsBody = z.object({
  notifyChanges: z.boolean().optional(), notifyWeekend: z.boolean().optional(), notifyTodayMeal: z.boolean().optional(),
  cookLanguage: language.optional(), cookTransliterate: z.boolean().optional(),
}).refine((b) => Object.keys(b).length > 0, 'No changes supplied');
const aggregateBody = z.object({
  referenceDate: z.string(), pantryOverrides: z.array(z.object({ canonicalName: z.string(), inPantry: z.boolean() })).default([]),
  slots: z.array(z.object({
    slotId: z.string(), plannedFor: z.string(), servings: z.number().int().min(1), recipeId: z.string(), recipeTitle: z.string(),
    recipeVersionId: z.string(), defaultServings: z.number().int().min(1),
    ingredients: z.array(z.object({ name: z.string(), quantity: z.number(), unit: z.string(), optional: z.boolean().optional() })),
  })).max(21),
});

/** Phase 8 (cook links, cook view, feedback, member settings) and Phase 9 (metrics, dev lab hooks). */
@UseGuards(KitchenCircleEnabledGuard)
@Controller('kitchen-circle')
export class CookController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly cook: CookService,
    private readonly feedback: FeedbackService,
    private readonly metrics: KitchenCircleMetricsService,
    private readonly notifier: PlannerNotifierService,
  ) {}

  @Post('households/:id/cook-links')
  async createLink(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string, @Body({ schema: linkBody }) body: z.infer<typeof linkBody>) {
    return { success: true, ...(await this.cook.createLink(user.id, householdId, body)) };
  }

  @Get('households/:id/cook-links')
  async links(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string) {
    return { success: true, links: await this.cook.listLinks(user.id, householdId) };
  }

  /** Push one day's menu (and recipe link) to the household's cook now. */
  @Post('households/:id/cook/send-menu')
  async sendMenu(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string, @Body({ schema: sendMenuBody }) body: z.infer<typeof sendMenuBody>) {
    return { success: true, ...(await this.notifier.sendCookMenu(user.id, householdId, body.date)) };
  }

  @Post('cook-links/:id/revoke')
  async revoke(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) linkId: string) {
    return { success: true, link: await this.cook.revokeLink(user.id, linkId) };
  }

  /** Public: the cook opens this from WhatsApp/SMS without an account. */
  @Public()
  @Get('cook/:token')
  async publicView(@Param('token', { schema: tokenParam }) token: string, @Query({ schema: viewQuery }) query: z.infer<typeof viewQuery>) {
    return { success: true, view: await this.cook.publicView(token, { language: query.language, transliterate: query.transliterate === undefined ? undefined : query.transliterate === 'true' }) };
  }

  /** Read-aloud from the public cook link (the words come from the link's own view). */
  @Public()
  @Post('cook/:token/speech')
  async speakForLink(@Param('token', { schema: tokenParam }) token: string, @Body({ schema: speechBody }) body: z.infer<typeof speechBody>) {
    return { success: true, ...(await this.cook.speakForLink(token, body)) };
  }

  @Post('households/:id/cook-week/speech')
  async speakForMember(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string, @Body({ schema: speechBody }) body: z.infer<typeof speechBody>) {
    return { success: true, ...(await this.cook.speakForMember(user.id, householdId, body)) };
  }

  /** The cached mp3 behind a read-aloud URL: a plain URL so any player (web audio, native) can stream it. */
  @Public()
  @Get('speech/:key')
  async speechAudio(@Param('key', { schema: speechKey }) key: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const audio = await this.cook.speechAudio(key);
    reply.header('content-type', 'audio/mpeg').header('cache-control', 'public, max-age=2592000, immutable');
    return audio;
  }

  @Get('households/:id/cook-week')
  async cookWeek(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string, @Query({ schema: viewQuery }) query: z.infer<typeof viewQuery>) {
    return { success: true, view: await this.cook.cookWeek(user.id, householdId, { language: query.language, transliterate: query.transliterate === undefined ? undefined : query.transliterate === 'true' }) };
  }

  @Post('slots/:id/feedback')
  async recordFeedback(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) slotId: string, @Body({ schema: feedbackBody }) body: z.infer<typeof feedbackBody>) {
    return { success: true, feedback: await this.feedback.record(user.id, slotId, body) };
  }

  @Get('plans/:id/feedback')
  async planFeedback(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) planId: string) {
    return { success: true, days: await this.feedback.forPlan(user.id, planId) };
  }

  @Get('households/:id/my-settings')
  async settings(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string) {
    return { success: true, settings: await this.cook.settings(user.id, householdId) };
  }

  @Put('households/:id/my-settings')
  async updateSettings(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string, @Body({ schema: settingsBody }) body: z.infer<typeof settingsBody>) {
    return { success: true, settings: await this.cook.updateSettings(user.id, householdId, body) };
  }

  @AdminOnly()
  @Get('admin/metrics')
  async adminMetrics(@Query({ schema: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }) query: { days: number }) {
    return { success: true, metrics: await this.metrics.summary(query.days) };
  }

  // ── Dev-only hooks for the Planner Lab and E2E (never mounted behaviour in production) ──
  private devOnly() {
    if (this.env.NODE_ENV === 'production') throw new NotFoundException();
  }

  @Public()
  @Post('lab/aggregate')
  labAggregate(@Body({ schema: aggregateBody }) body: z.infer<typeof aggregateBody>) {
    this.devOnly();
    return { success: true, lines: aggregateRequirements(body.slots, effectivePantry(body.pantryOverrides), body.referenceDate) };
  }

  @Public()
  @Post('lab/chat-policy')
  labChatPolicy(@Body({ schema: z.object({ actions: z.array(z.object({ type: z.string(), slotLocked: z.boolean().default(false) }).passthrough()).max(14) }) }) body: { actions: Array<{ type: string; slotLocked: boolean }> }) {
    this.devOnly();
    const shape = messageShape(body.actions as unknown as ChatAction[]);
    return { success: true, decisions: body.actions.map((a) => ({ type: a.type, ...decide(a as unknown as ChatAction, {
      slotLocked: a.slotLocked, dayEditsInMessage: shape.dayEditsInMessage, mealsOnSameDay: shape.mealsOnSameDay(a as unknown as ChatAction) }) })) };
  }

  @Public()
  @Get('lab/notification-previews')
  labNotificationPreviews() {
    this.devOnly();
    return { success: true, previews: PlannerNotifierService.previews() };
  }

  @Public()
  @Post('lab/notify-tick')
  async labNotifyTick(@Body({ schema: z.object({ now: z.iso.datetime().optional() }) }) body: { now?: string }) {
    this.devOnly();
    return { success: true, ...(await this.notifier.tick({ now: body.now ? new Date(body.now) : undefined, force: true })) };
  }
}
