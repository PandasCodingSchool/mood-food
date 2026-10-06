import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { fail } from '../common/http.js';
import { RateLimit } from '../common/rate-limit.js';
import { CurrentUser, Public } from './auth.guard.js';
import {
  loginBody,
  otpVerifyBody,
  passwordChangeBody,
  passwordResetBody,
  phoneBody,
  signupBody,
  type LoginBody,
  type OtpVerifyBody,
  type PasswordChangeBody,
  type PasswordResetBody,
  type SignupBody,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { AppRequest, AuthUser } from './auth.types.js';
import { SessionsService } from './sessions.service.js';

const meta = (req: AppRequest) => ({ userAgent: req.headers['user-agent'], ip: req.ip });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Post('guest')
  guest(@Req() req: AppRequest) {
    return this.auth.guest(meta(req));
  }

  @Public()
  @Get('methods')
  methods() {
    return this.auth.methods();
  }

  @Public()
  @RateLimit('signup')
  @Post('signup')
  signup(@Body({ schema: signupBody }) body: SignupBody, @Req() req: AppRequest) {
    return this.auth.signup(body, req.user, meta(req));
  }

  @Public()
  @RateLimit('login')
  @Post('login')
  @HttpCode(200)
  login(@Body({ schema: loginBody }) body: LoginBody, @Req() req: AppRequest) {
    return this.auth.login(body, meta(req));
  }

  @Public()
  @RateLimit('otpSend')
  @Post('otp/send')
  @HttpCode(200)
  sendOtp(@Body({ schema: phoneBody }) body: { phone: string }) {
    return this.auth.sendOtp(body.phone);
  }

  @Public()
  @RateLimit('otpVerify')
  @Post('otp/verify')
  async verifyOtp(
    @Body({ schema: otpVerifyBody }) body: OtpVerifyBody,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.verifyOtp(body, req.user, meta(req));
    reply.status(result.isNew ? 201 : 200); // v1 contract: 201 new account, 200 login
    return result;
  }

  @Public()
  @RateLimit('otpVerify')
  @Post('password/reset')
  @HttpCode(200)
  resetPassword(@Body({ schema: passwordResetBody }) body: PasswordResetBody, @Req() req: AppRequest) {
    return this.auth.resetPassword(body, meta(req));
  }

  @Post('password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body({ schema: passwordChangeBody }) body: PasswordChangeBody) {
    return this.auth.changePassword(user, body);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser) {
    await this.sessions.revoke(user.id, user.sessionId);
    return { success: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: AuthUser) {
    return { success: true, signedOutSessions: await this.sessions.revokeAll(user.id, user.sessionId) };
  }

  @Get('sessions')
  async list(@CurrentUser() user: AuthUser) {
    const sessions = await this.sessions.list(user.id);
    return { success: true, sessions: sessions.map((s) => ({ ...s, current: s.id === user.sessionId })) };
  }

  @Delete('sessions/:id')
  async revoke(@CurrentUser() user: AuthUser, @Param('id', { schema: z.uuid() }) id: string) {
    if (!(await this.sessions.revoke(user.id, id))) fail(404, 'Session not found');
    return { success: true };
  }
}
