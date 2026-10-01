import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { envSchema, type Env } from './env.js';

let cached: Env | null = null;

/** Loads apps/api/.env (if present) into process.env, then validates it. */
export function loadEnv(): Env {
  if (cached) return cached;
  const file = resolve(import.meta.dirname, '../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
