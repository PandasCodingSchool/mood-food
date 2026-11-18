import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { RateLimit } from '../common/rate-limit.js';
import { KitchenCircleEnabledGuard } from './feature.guard.js';
import { ChatService } from './chat.service.js';

const householdId = z.uuid();
const actionId = z.uuid();
const sendBody = z.object({ planId: z.uuid(), body: z.string().trim().min(1).max(1_000), clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional() });
const voiceBody = z.object({
  planId: z.uuid(),
  // Base64 audio (data: prefix allowed); ~6 MB is minutes of speech — the app caps clips at 90 s.
  audio: z.string().min(16).max(8_000_000),
  mimeType: z.string().trim().regex(/^audio\/[a-z0-9.+-]+(;.*)?$/i).max(80),
  /** Clip length from the recorder: the transcriber uses it to spot a transcript longer than the clip could hold. */
  seconds: z.number().min(0).max(600).optional(),
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
});
const progressParams = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const progressQuery = z.object({ after: z.coerce.number().int().min(0).max(500).optional() });
const listQuery = z.object({ planId: z.uuid().optional() });
const clarifyBody = z.object({ optionIndex: z.number().int().min(0).max(10) });

/** Phase 6 shared chat. Every interpreted action becomes an auditable card governed by the chat policy. */
@UseGuards(KitchenCircleEnabledGuard)
@Controller('kitchen-circle')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('households/:id/chat')
  async list(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Query({ schema: listQuery }) query: z.infer<typeof listQuery>) {
    return { success: true, messages: await this.chat.messages(user.id, id, query.planId) };
  }

  // Polled by the app while a message is being handled (every ~0.7 s for a few seconds).
  @Get('households/:id/chat/progress/:clientId')
  async progress(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Param('clientId', { schema: progressParams }) clientId: string,
    @Query({ schema: progressQuery }) query: z.infer<typeof progressQuery>) {
    return { success: true, ...(await this.chat.progress(user.id, id, clientId, query.after ?? 0)) };
  }

  // Interpretation may call an LLM, so messages share the per-session signals budget.
  @RateLimit('signals')
  @Post('households/:id/chat')
  async send(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Body({ schema: sendBody }) body: z.infer<typeof sendBody>) {
    return { success: true, ...(await this.chat.send(user.id, id, body)) };
  }

  // Transcription + the agent loop: same budget as a typed message.
  @RateLimit('signals')
  @Post('households/:id/chat/voice')
  async voice(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Body({ schema: voiceBody }) body: z.infer<typeof voiceBody>) {
    return { success: true, ...(await this.chat.sendVoice(user.id, id, body)) };
  }

  @Post('chat/actions/:id/confirm')
  async confirm(@CurrentUser() user: AuthUser, @Param('id', { schema: actionId }) id: string) {
    return { success: true, ...(await this.chat.confirm(user.id, id)) };
  }

  @Post('chat/actions/:id/reject')
  async reject(@CurrentUser() user: AuthUser, @Param('id', { schema: actionId }) id: string) {
    return { success: true, ...(await this.chat.reject(user.id, id)) };
  }

  @Post('chat/actions/:id/clarify')
  async clarify(@CurrentUser() user: AuthUser, @Param('id', { schema: actionId }) id: string, @Body({ schema: clarifyBody }) body: z.infer<typeof clarifyBody>) {
    return { success: true, ...(await this.chat.clarify(user.id, id, body.optionIndex)) };
  }
}
