import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../core/tokens.js';
import { hashSecret, verifySecret } from './password.js';

export const OTP_TTL_SEC = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpCheck = 'ok' | 'missing' | 'locked' | 'invalid';

/**
 * 6-digit one-time codes, hashed in Redis with 5 attempts. Keyed by a subject:
 * an E.164 phone for SMS OTPs, or `email-verify:…` / `email-reset:…` for email codes.
 */
@Injectable()
export class OtpService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key = (subject: string) => `otp:${subject}`;

  async issue(subject: string, ttlSec = OTP_TTL_SEC): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis
      .multi()
      .hset(this.key(subject), { hash: await hashSecret(code), attempts: 0 })
      .expire(this.key(subject), ttlSec)
      .exec();
    return code;
  }

  /** Checks a code without consuming it; call `consume` once the login succeeds. */
  async check(subject: string, code: string): Promise<OtpCheck> {
    const rec = await this.redis.hgetall(this.key(subject));
    if (!rec.hash) return 'missing';
    if (Number(rec.attempts) >= OTP_MAX_ATTEMPTS) return 'locked';
    if (await verifySecret(code, rec.hash)) return 'ok';
    await this.redis.hincrby(this.key(subject), 'attempts', 1);
    return 'invalid';
  }

  async consume(subject: string) {
    await this.redis.del(this.key(subject));
  }
}
