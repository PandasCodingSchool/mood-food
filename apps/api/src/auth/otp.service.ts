import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../core/tokens.js';
import { hashSecret, verifySecret } from './password.js';

export const OTP_TTL_SEC = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpCheck = 'ok' | 'missing' | 'locked' | 'invalid';

/** 6-digit phone OTPs, hashed in Redis with a 5-minute TTL and 5 attempts. */
@Injectable()
export class OtpService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key = (phone: string) => `otp:${phone}`;

  async issue(phone: string): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis
      .multi()
      .hset(this.key(phone), { hash: await hashSecret(code), attempts: 0 })
      .expire(this.key(phone), OTP_TTL_SEC)
      .exec();
    return code;
  }

  /** Checks a code without consuming it; call `consume` once the login succeeds. */
  async check(phone: string, code: string): Promise<OtpCheck> {
    const rec = await this.redis.hgetall(this.key(phone));
    if (!rec.hash) return 'missing';
    if (Number(rec.attempts) >= OTP_MAX_ATTEMPTS) return 'locked';
    if (await verifySecret(code, rec.hash)) return 'ok';
    await this.redis.hincrby(this.key(phone), 'attempts', 1);
    return 'invalid';
  }

  async consume(phone: string) {
    await this.redis.del(this.key(phone));
  }
}
