import { Controller, Get, Inject, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { Public } from '../auth/auth.guard.js';
import { NoRateLimit } from '../common/rate-limit.js';
import { DB, REDIS, type Database } from '../core/tokens.js';

@Public()
@NoRateLimit()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness + dependency check; 503 if Postgres or Redis is down. */
  @Get()
  async health(@Res({ passthrough: true }) reply: FastifyReply) {
    const [pgRes, redisRes] = await Promise.allSettled([
      this.db.execute<{ now: string }>(sql`select now() as now`),
      this.redis.ping(),
    ]);
    const database = pgRes.status === 'fulfilled' ? 'ok' : 'down';
    const redis = redisRes.status === 'fulfilled' ? 'ok' : 'down';
    const ok = database === 'ok' && redis === 'ok';
    reply.status(ok ? 200 : 503);
    return {
      status: ok ? 'ok' : 'error',
      timestamp: new Date(pgRes.status === 'fulfilled' ? pgRes.value.rows[0].now : Date.now()).toISOString(),
      database: 'postgresql',
      checks: { database, redis },
    };
  }
}
