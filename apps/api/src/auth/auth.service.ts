import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { fail, isUniqueViolation } from '../common/http.js';
import { DB, ENV, type Database } from '../core/tokens.js';
import { users } from '../db/schema.js';
import type { AuthUser } from './auth.types.js';
import type { LoginBody, OtpVerifyBody, PasswordChangeBody, PasswordResetBody, SignupBody } from './auth.schemas.js';
import { OtpService } from './otp.service.js';
import { burnVerify, hashSecret, verifySecret } from './password.js';
import { normalizePhone } from './phone.js';
import { SessionsService } from './sessions.service.js';
import { SmsService } from './sms.service.js';

type UserRow = typeof users.$inferSelect;
export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

/** User shape returned by every auth endpoint. `sessionId` is the bearer token (v1 field name). */
function authPayload(user: UserRow, session: { token: string; expiresAt: string }) {
  return {
    success: true,
    user: {
      id: user.id,
      sessionId: session.token,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      isGuest: user.isGuest,
    },
    session,
  };
}

@Injectable()
export class AuthService {
  private readonly log = new Logger('Auth');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly sessions: SessionsService,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
  ) {}

  phone(raw: unknown): string {
    return normalizePhone(raw, this.env.DEFAULT_PHONE_REGION) ?? fail(400, 'Valid phone number is required');
  }

  private findByPhone(phone: string) {
    return this.db.query.users.findFirst({ where: eq(users.phone, phone) });
  }

  private findByEmail(email: string) {
    // lower() also matches mixed-case emails saved before they were normalised.
    return this.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  }

  /** Which sign-in methods the app should offer: SMS OTP only when a real SMS provider is configured. */
  methods() {
    return { success: true, email: true, otp: this.env.SMS_PROVIDER === 'twilio' || this.env.NODE_ENV !== 'production' };
  }

  /** Anonymous account so guests can use personalised features; upgradable later. */
  async guest(meta: ClientMeta) {
    const [user] = await this.db.insert(users).values({ isGuest: true }).returning();
    return authPayload(user, await this.sessions.issue(user.id, meta));
  }

  async signup(body: SignupBody, current: AuthUser | undefined, meta: ClientMeta) {
    const phone = body.phone ? this.phone(body.phone) : undefined;
    const { email } = body;
    if (email && (await this.findByEmail(email))) fail(409, 'Email already registered');
    if (phone && (await this.findByPhone(phone))) fail(409, 'Phone number already registered');
    const passwordHash = await hashSecret(body.password);
    const user = await this.createOrUpgrade(current, { name: body.name, phone, email, passwordHash });
    return authPayload(user, await this.sessions.issue(user.id, meta));
  }

  async login(body: LoginBody, meta: ClientMeta) {
    const user = body.email ? await this.findByEmail(body.email) : await this.findByPhone(this.phone(body.phone));
    const ok = user?.passwordHash ? await verifySecret(body.password, user.passwordHash) : await burnVerify(body.password);
    if (!user || !ok) fail(401, body.email ? 'Invalid email or password' : 'Invalid phone number or password');
    return authPayload(user, await this.sessions.issue(user.id, meta));
  }

  async sendOtp(rawPhone: unknown) {
    const phone = this.phone(rawPhone);
    const code = await this.otp.issue(phone);
    try {
      await this.sms.send(phone, `Your MoodFood login code is ${code}. It is valid for 5 minutes.`);
    } catch (err) {
      this.log.error(`OTP send failed: ${(err as Error).message}`);
      await this.otp.consume(phone);
      fail(500, 'Failed to send OTP');
    }
    return { success: true, message: 'OTP sent' };
  }

  private async checkOtp(phone: string, code: string) {
    const result = await this.otp.check(phone, code);
    if (result === 'missing') fail(400, 'OTP expired or not requested');
    if (result === 'locked') fail(400, 'Too many failed attempts. Please request a new OTP.');
    if (result === 'invalid') fail(401, 'Invalid OTP');
  }

  async verifyOtp(body: OtpVerifyBody, current: AuthUser | undefined, meta: ClientMeta) {
    const phone = this.phone(body.phone);
    await this.checkOtp(phone, body.otp);

    let user = await this.findByPhone(phone);
    const isNew = !user;
    if (user) {
      if (!user.phoneVerifiedAt) {
        [user] = await this.db.update(users).set({ phoneVerifiedAt: new Date() }).where(eq(users.id, user.id)).returning();
      }
    } else {
      // Keep the OTP alive so the client can resend with a name.
      if (!body.name) fail(404, 'No account found. Please sign up.', { needsName: true });
      user = await this.createOrUpgrade(current, { name: body.name, phone, phoneVerifiedAt: new Date() });
    }
    await this.otp.consume(phone);
    return { ...authPayload(user, await this.sessions.issue(user.id, meta)), isNew };
  }

  /** Forgot password: prove the phone with an OTP, set a new password, sign out everywhere else. */
  async resetPassword(body: PasswordResetBody, meta: ClientMeta) {
    const phone = this.phone(body.phone);
    await this.checkOtp(phone, body.otp);
    const user = await this.findByPhone(phone);
    if (!user) fail(404, 'No account found. Please sign up.');
    const [updated] = await this.db
      .update(users)
      .set({ passwordHash: await hashSecret(body.password), phoneVerifiedAt: user.phoneVerifiedAt ?? new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    await this.otp.consume(phone);
    await this.sessions.revokeAll(user.id);
    return authPayload(updated, await this.sessions.issue(user.id, meta));
  }

  async changePassword(current: AuthUser, body: PasswordChangeBody) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, current.id) });
    if (!user) fail(404, 'User not found');
    if (user.passwordHash && !(await verifySecret(body.currentPassword ?? '', user.passwordHash))) {
      fail(401, 'Current password is incorrect');
    }
    await this.db
      .update(users)
      .set({ passwordHash: await hashSecret(body.newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    const signedOut = await this.sessions.revokeAll(user.id, current.sessionId);
    return { success: true, signedOutSessions: signedOut };
  }

  /** New account, or — when a guest is signed in — the guest account becomes a real one (keeps its data). */
  private async createOrUpgrade(
    current: AuthUser | undefined,
    fields: { name: string; phone?: string; email?: string; passwordHash?: string; phoneVerifiedAt?: Date },
  ): Promise<UserRow> {
    try {
      if (current?.isGuest) {
        const [user] = await this.db
          .update(users)
          .set({ ...fields, isGuest: false, updatedAt: new Date() })
          .where(eq(users.id, current.id))
          .returning();
        await this.sessions.revokeAll(current.id);
        return user;
      }
      const [user] = await this.db.insert(users).values(fields).returning();
      return user;
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, fields.phone ? 'Phone number already registered' : 'Email already registered');
      throw err;
    }
  }
}
