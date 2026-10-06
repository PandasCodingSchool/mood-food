import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Every environment variable the API reads, validated once at boot. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  TRUST_PROXY: bool.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default('*'),

  DATABASE_URL: z.string().default('postgres://moodfood:moodfood@localhost:5432/moodfood'),
  DATABASE_SSL: bool.default(false),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),
  DB_MIGRATE_ON_BOOT: bool.default(true),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Auth
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  DEFAULT_PHONE_REGION: z.string().length(2).default('IN'),
  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('changeme'),

  // Rate limits (requests per 15 minutes)
  RATE_LIMIT_GENERAL: z.coerce.number().int().default(300),
  RATE_LIMIT_IP: z.coerce.number().int().default(2000),
  RATE_LIMIT_AI: z.coerce.number().int().default(10),
  RATE_LIMIT_SIGNALS: z.coerce.number().int().default(120),
  RATE_LIMIT_SIGNUP: z.coerce.number().int().default(20),

  // Intelligence service (Python)
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  AI_SERVICE_KEY: z.string().optional(),
  INTELLIGENCE_SYNC_KEY: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().default(90000),
  AI_MAX_RETRIES: z.coerce.number().int().default(0),
  AI_RETRY_BASE_DELAY_MS: z.coerce.number().int().default(400),
  SWIGGY_TIMEOUT_MS: z.coerce.number().int().default(25000),
  RECIPE_TIMEOUT_MS: z.coerce.number().int().default(30000),
  GAME_ASSIST_TIMEOUT_MS: z.coerce.number().int().default(3000),
  LEARN_TIMEOUT_MS: z.coerce.number().int().default(8000),

  // Swiggy OAuth
  SWIGGY_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  SWIGGY_OAUTH_REDIRECT_URI: z.string().default('https://moodfood.fun/api/swiggy/oauth/callback'),
  FRONTEND_ORIGIN: z.string().default('https://moodfood.fun'),

  // Push + storage
  EXPO_ACCESS_TOKEN: z.string().optional(),
  WALL_PHOTO_BUCKET: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  if (env.ADMIN_PASSWORD === 'changeme') {
    ctx.addIssue({ code: 'custom', path: ['ADMIN_PASSWORD'], message: 'must be changed from the default in production' });
  }
  if (!env.SWIGGY_TOKEN_ENCRYPTION_KEY) {
    ctx.addIssue({ code: 'custom', path: ['SWIGGY_TOKEN_ENCRYPTION_KEY'], message: 'is required in production' });
  }
});

export type Env = z.infer<typeof envSchema>;
