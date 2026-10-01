import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { loadEnv } from '../config/load-env.js';

export const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../drizzle');

/** Applies pending SQL migrations from apps/api/drizzle (idempotent). */
export async function runMigrations(pool: pg.Pool) {
  await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_DIR });
}

// `pnpm db:migrate` entry point.
if (process.argv[1] === import.meta.filename) {
  const env = loadEnv();
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined });
  runMigrations(pool)
    .then(() => console.log('Migrations applied'))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
