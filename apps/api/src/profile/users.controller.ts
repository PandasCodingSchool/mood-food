import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Put, Req } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import { AuthService } from '../auth/auth.service.js';
import type { AppRequest, AuthUser } from '../auth/auth.types.js';
import { OtpService } from '../auth/otp.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { fail, isUniqueViolation } from '../common/http.js';
import { DB, type Database } from '../core/tokens.js';
import { users } from '../db/schema.js';
import { SwiggyTokensService } from '../swiggy/swiggy-tokens.service.js';

const updateBody = z
  .object({
    name: z.string().trim().max(100).nullish(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => v || null)
      .pipe(z.email('Invalid email address').nullable())
      .nullish(),
    phone: z.unknown().optional(),
  })
  .refine((b) => b.phone === undefined, 'Verify a new phone number with POST /api/user/me/phone');
const phoneChangeBody = z.object({
  phone: z.string({ error: 'Valid phone number is required' }),
  otp: z.string().trim().regex(/^\d{6}$/, '6-digit OTP is required'),
});

/** The signed-in user's own account. */
@Controller('user/me')
export class UsersController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly swiggy: SwiggyTokensService,
    private readonly sessions: SessionsService,
    private readonly auth: AuthService,
    private readonly otp: OtpService,
  ) {}

  private async me(userId: string) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) fail(404, 'User not found');
    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isGuest: user.isGuest,
        phoneVerified: !!user.phoneVerifiedAt,
        emailVerified: !!user.emailVerifiedAt,
        hasPassword: !!user.passwordHash,
        personaArchetype: user.personaArchetype,
        createdAt: user.createdAt,
        ...(await this.swiggy.info(user.id)),
      },
    };
  }

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.me(user.id);
  }

  @Put()
  async update(@CurrentUser() user: AuthUser, @Body({ schema: updateBody }) body: z.infer<typeof updateBody>) {
    const set = {
      ...(body.name !== undefined && { name: body.name || null }),
      // A different address must be verified again; re-saving the same one keeps its status.
      ...(body.email !== undefined && {
        email: body.email,
        emailVerifiedAt: sql`case when ${users.email} is distinct from ${body.email} then null else ${users.emailVerifiedAt} end`,
      }),
    };
    if (Object.keys(set).length) {
      try {
        await this.db.update(users).set({ ...set, updatedAt: new Date() }).where(eq(users.id, user.id));
      } catch (err) {
        if (isUniqueViolation(err)) fail(409, 'Email already in use');
        throw err;
      }
    }
    return this.me(user.id);
  }

  /** Change phone number: send an OTP to the new number via /auth/otp/send first. */
  @Post('phone')
  @HttpCode(200)
  async changePhone(@CurrentUser() user: AuthUser, @Body({ schema: phoneChangeBody }) body: z.infer<typeof phoneChangeBody>) {
    const phone = this.auth.phone(body.phone);
    const check = await this.otp.check(phone, body.otp);
    if (check !== 'ok') fail(check === 'invalid' ? 401 : 400, check === 'invalid' ? 'Invalid OTP' : 'OTP expired or not requested');
    try {
      await this.db
        .update(users)
        .set({ phone, phoneVerifiedAt: new Date(), isGuest: false, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, 'Phone number already registered');
      throw err;
    }
    await this.otp.consume(phone);
    await this.sessions.refreshCache(user.id);
    return this.me(user.id);
  }

  /** Permanently delete the account and everything tied to it (app-store requirement). */
  @Delete()
  async remove(@CurrentUser() user: AuthUser, @Req() req: AppRequest) {
    await this.sessions.revokeAll(user.id);
    await this.swiggy.unlink(user.id);
    await this.db.delete(users).where(eq(users.id, user.id));
    req.log.info({ userId: user.id }, 'account deleted');
    return { success: true };
  }
}
