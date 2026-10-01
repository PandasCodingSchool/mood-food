import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import { fail } from '../common/http.js';
import { DB, ENV, type Database } from '../core/tokens.js';
import { diySessions } from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';

const createBody = z.object({
  dishName: z.string({ error: 'dishName and recipe are required' }).trim().min(1, 'dishName and recipe are required').max(255),
  recipe: z.unknown().refine((r) => r != null, 'dishName and recipe are required'),
  ingredientCart: z.array(z.unknown()).default([]),
  matchedProducts: z.array(z.unknown()).default([]),
});
const patchBody = z
  .object({
    ingredientCart: z.array(z.unknown()),
    matchedProducts: z.array(z.unknown()),
    completedSteps: z.array(z.number().int().min(0)),
    status: z.string().max(50),
    instamartOrderId: z.string().max(255).nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'No fields to update');
const photoBody = z.object({
  imageBase64: z.string({ error: 'imageBase64 is required' }).min(1, 'imageBase64 is required').max(12_000_000),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']).default('image/jpeg'),
});

const serialize = ({ userId: _u, ...s }: typeof diySessions.$inferSelect) => s;

/** DIY cooking sessions: recipe + ingredient cart + step progress + wall photo. */
@Controller('diy')
export class DiyController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly intelligence: IntelligenceService,
  ) {}

  private where(userId: string, id: string) {
    return and(eq(diySessions.id, id), eq(diySessions.userId, userId));
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.db
      .select()
      .from(diySessions)
      .where(eq(diySessions.userId, user.id))
      .orderBy(desc(diySessions.createdAt))
      .limit(50);
    return { success: true, sessions: rows.map(serialize) };
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id', { schema: z.uuid() }) id: string) {
    const [row] = await this.db.select().from(diySessions).where(this.where(user.id, id));
    if (!row) fail(404, 'Not found');
    return { success: true, session: serialize(row) };
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body({ schema: createBody }) body: z.infer<typeof createBody>) {
    const [{ id }] = await this.db
      .insert(diySessions)
      .values({ userId: user.id, ...body })
      .returning({ id: diySessions.id });
    return { success: true, id };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: patchBody }) body: z.infer<typeof patchBody>,
  ) {
    await this.db.update(diySessions).set({ ...body, updatedAt: new Date() }).where(this.where(user.id, id));
    return { success: true };
  }

  /** Food-only moderation gate, then storage (locked until WALL_PHOTO_BUCKET is configured). */
  @Post(':id/wall-photo')
  async wallPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: photoBody }) body: z.infer<typeof photoBody>,
  ) {
    const [session] = await this.db.select({ id: diySessions.id }).from(diySessions).where(this.where(user.id, id));
    if (!session) fail(404, 'Not found');

    let moderation: { success?: boolean; is_food?: boolean; reason?: string; error?: string };
    try {
      moderation = await this.intelligence.json('POST', '/api/moderation/check-food-photo', {
        body: { image_base64: body.imageBase64, mime_type: body.mimeType },
        timeoutMs: 30_000,
      });
    } catch {
      fail(502, 'Moderation check failed', { success: false });
    }
    if (!moderation.success) fail(502, moderation.error || 'Moderation check failed', { success: false });
    if (!moderation.is_food) {
      fail(422, moderation.reason || "That doesn't look like food — try another photo.", {
        success: false,
        rejected: true,
        reason: moderation.reason || "That doesn't look like food — try another photo.",
      });
    }
    if (!this.env.WALL_PHOTO_BUCKET) {
      fail(503, 'Wall photo storage is not configured yet — this feature is coming soon.', { success: false, locked: true });
    }
    // Storage adapter goes here once a bucket exists (S3/R2 PutObject → public URL).
    fail(501, 'Wall photo storage configured but upload not implemented', { success: false });
  }
}
