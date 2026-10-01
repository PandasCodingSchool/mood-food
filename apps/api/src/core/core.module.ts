import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Redis } from 'ioredis';
import pg from 'pg';
import { loadEnv } from '../config/load-env.js';
import type { Env } from '../config/env.js';
import * as schema from '../db/schema.js';
import { DB, ENV, PG_POOL, REDIS } from './tokens.js';

/** Process-wide singletons: validated env, the Postgres pool + Drizzle, and Redis. */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env) =>
        new pg.Pool({
          connectionString: env.DATABASE_URL,
          max: env.DATABASE_POOL_MAX,
          ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
        }),
    },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: pg.Pool) => drizzle({ client: pool, schema }) },
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => {
        const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
        const log = new Logger('Redis');
        redis.on('error', (err) => log.warn(err.message));
        return redis;
      },
    },
  ],
  exports: [ENV, DB, PG_POOL, REDIS],
})
export class CoreModule implements OnApplicationShutdown {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown() {
    await Promise.allSettled([this.pool.end(), this.redis.quit()]);
  }
}
