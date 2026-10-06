import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ── Users & auth ──────────────────────────────────────────────────────────

export const userRole = pgEnum('user_role', ['user', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** E.164 (e.g. +919876543210); null for guests. */
  phone: varchar('phone', { length: 20 }).unique(),
  email: varchar('email', { length: 255 }).unique(),
  name: varchar('name', { length: 255 }),
  passwordHash: text('password_hash'),
  role: userRole('role').notNull().default('user'),
  isGuest: boolean('is_guest').notNull().default(false),
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  // Personalization columns synced from the learning service.
  personaArchetype: varchar('persona_archetype', { length: 100 }),
  questionBudget: integer('question_budget').notNull().default(3),
  automationPref: varchar('automation_pref', { length: 50 }).notNull().default('balanced'),
  comfortAnchors: jsonb('comfort_anchors').$type<Array<{ food: string; trigger?: string }>>(),
  pushToken: text('push_token'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One row per signed-in device. The bearer token is stored only as a SHA-256 hash. */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    userAgent: text('user_agent'),
    ip: varchar('ip', { length: 64 }),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('idx_auth_sessions_user').on(t.userId)],
);

// ── Profile data ──────────────────────────────────────────────────────────

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  diets: jsonb('diets').$type<string[]>().notNull().default([]),
  allergies: jsonb('allergies').$type<string[]>().notNull().default([]),
  cuisines: jsonb('cuisines').$type<string[]>().notNull().default([]),
  budget: integer('budget').notNull().default(1),
  updatedAt: updatedAt(),
});

export const orderHistory = pgTable(
  'order_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    dishName: varchar('dish_name', { length: 255 }).notNull(),
    cuisine: varchar('cuisine', { length: 100 }),
    emoji: text('emoji').notNull().default('🍽️'),
    priceInr: integer('price_inr').notNull().default(0),
    platform: varchar('platform', { length: 50 }).notNull().default('swiggy'),
    via: varchar('via', { length: 100 }),
    gradientStart: varchar('gradient_start', { length: 20 }).notNull().default('#f97316'),
    gradientEnd: varchar('gradient_end', { length: 20 }).notNull().default('#fbbf24'),
    ordered: boolean('ordered').notNull().default(true),
    saved: boolean('saved').notNull().default(false),
    swiggyOrderId: varchar('swiggy_order_id', { length: 255 }),
    restaurantId: varchar('restaurant_id', { length: 255 }),
    menuItemId: varchar('menu_item_id', { length: 255 }),
    addressId: varchar('address_id', { length: 255 }),
    createdAt: createdAt(),
  },
  (t) => [index('idx_order_history_user').on(t.userId, t.createdAt)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull().default('info'),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    read: boolean('read').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('idx_notifications_user').on(t.userId, t.createdAt.desc())],
);

export const diySessions = pgTable(
  'diy_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    dishName: varchar('dish_name', { length: 255 }).notNull(),
    recipe: jsonb('recipe').notNull(),
    ingredientCart: jsonb('ingredient_cart').$type<unknown[]>().notNull().default([]),
    matchedProducts: jsonb('matched_products').$type<unknown[]>().notNull().default([]),
    completedSteps: integer('completed_steps').array().notNull().default(sql`'{}'::integer[]`),
    instamartOrderId: varchar('instamart_order_id', { length: 255 }),
    status: varchar('status', { length: 50 }).notNull().default('cart'),
    wallPhotoUrl: text('wall_photo_url'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('idx_diy_sessions_user').on(t.userId, t.createdAt)],
);

/** Encrypted per-user Swiggy OAuth tokens (AES-256-GCM). */
export const swiggyUserTokens = pgTable(
  'swiggy_user_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    swiggyUserId: varchar('swiggy_user_id', { length: 255 }).notNull(),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.swiggyUserId), index('idx_swiggy_tokens_user').on(t.userId, t.isActive)],
);

// ── Personalization ───────────────────────────────────────────────────────

/** Append-only event log (the "signals spine"); the learning service replays it by id. */
export const signals = pgTable(
  'signals',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull(),
    context: jsonb('context'),
    createdAt: createdAt(),
  },
  (t) => [index('idx_signals_user').on(t.userId, t.id)],
);

/** Durable mirror of the learned taste embedding (Python owns the live copy). */
export const tasteVector = pgTable('taste_vector', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  embedding: jsonb('embedding').$type<number[]>().notNull(),
  dim: integer('dim').notNull(),
  modelVersion: varchar('model_version', { length: 100 }),
  updatedAt: updatedAt(),
});

/** Calibration loop: predicted vs actual enjoyment per recommendation. */
export const predictions = pgTable(
  'predictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    recId: varchar('rec_id', { length: 255 }).notNull(),
    dishId: varchar('dish_id', { length: 255 }),
    dishName: varchar('dish_name', { length: 255 }),
    predictedScore: real('predicted_score'),
    confidence: real('confidence'),
    userPredictedScore: real('user_predicted_score'),
    actualScore: real('actual_score'),
    context: jsonb('context'),
    createdAt: createdAt(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('idx_predictions_user').on(t.userId, t.resolvedAt)],
);

/** Durable mirror of the learned mood → food-archetype map. */
export const moodFoodMap = pgTable(
  'mood_food_map',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    moodKey: varchar('mood_key', { length: 100 }).notNull(),
    foodArchetype: varchar('food_archetype', { length: 100 }).notNull(),
    weight: real('weight').notNull(),
    nObs: integer('n_obs').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.moodKey, t.foodArchetype] })],
);

// ── Retention & social ────────────────────────────────────────────────────

export const quests = pgTable('quests', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  definition: jsonb('definition').$type<{ target?: number }>().notNull().default({}),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const userQuests = pgTable(
  'user_quests',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    questId: integer('quest_id').notNull().references(() => quests.id, { onDelete: 'cascade' }),
    progress: jsonb('progress').$type<{ count?: number; lastCheckinDate?: string }>().notNull().default({}),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    streakCount: integer('streak_count').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questId] })],
);

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  config: jsonb('config').notNull().default({}),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
});

export const groupSessions = pgTable('group_sessions', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  hostUserId: uuid('host_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  config: jsonb('config').notNull().default({}),
  createdAt: createdAt(),
});

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: integer('group_id').notNull().references(() => groupSessions.id, { onDelete: 'cascade' }),
    memberKey: varchar('member_key', { length: 100 }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    displayName: varchar('display_name', { length: 100 }),
    swipes: jsonb('swipes').$type<Array<Record<string, unknown>>>().notNull().default([]),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.memberKey] })],
);

// ── Marketing & analytics ─────────────────────────────────────────────────

export const waitlist = pgTable(
  'waitlist',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    city: varchar('city', { length: 255 }),
    cuisine: varchar('cuisine', { length: 50 }),
    createdAt: createdAt(),
  },
  (t) => [index('idx_waitlist_created').on(t.createdAt)],
);

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventName: varchar('event_name', { length: 255 }).notNull(),
    properties: jsonb('properties').notNull().default({}),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [index('idx_analytics_events_name').on(t.eventName), index('idx_analytics_events_created').on(t.createdAt)],
);

export const quizCompletions = pgTable(
  'quiz_completions',
  {
    id: serial('id').primaryKey(),
    mood: varchar('mood', { length: 50 }).notNull(),
    craving: varchar('craving', { length: 50 }).notNull(),
    budget: varchar('budget', { length: 50 }).notNull(),
    preference: varchar('preference', { length: 50 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('idx_quiz_completions_created').on(t.createdAt)],
);

export const orderClicks = pgTable(
  'order_clicks',
  {
    id: serial('id').primaryKey(),
    dishName: varchar('dish_name', { length: 255 }).notNull(),
    dishType: varchar('dish_type', { length: 50 }).notNull().default('main'),
    platform: varchar('platform', { length: 50 }).notNull().default('swiggy'),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [index('idx_order_clicks_created').on(t.createdAt), index('idx_order_clicks_dish').on(t.dishName)],
);
