import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  doublePrecision,
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
  uniqueIndex,
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

// ── KitchenCircle ─────────────────────────────────────────────────────────

export const kitchenCircleMemberRole = pgEnum('kitchen_circle_member_role', ['owner', 'member', 'cook']);
export const kitchenCircleSlotState = pgEnum('kitchen_circle_slot_state', [
  'blank', 'planned', 'locked', 'leftovers', 'no_cook', 'household_out',
]);
export const kitchenCircleAttendanceStatus = pgEnum('kitchen_circle_attendance_status', ['attending', 'absent']);
export const kitchenCircleRuleStrength = pgEnum('kitchen_circle_rule_strength', ['hard', 'preference', 'contextual']);
export const kitchenCirclePreferenceStrength = pgEnum('kitchen_circle_preference_strength', ['cannot_eat', 'never_plan', 'prefer_less', 'favourite']);
export const kitchenCircleReaction = pgEnum('kitchen_circle_reaction', ['looks_good', 'not_for_me']);
export const kitchenCircleRecipeSource = pgEnum('kitchen_circle_recipe_source', ['catalog', 'household', 'ai_draft']);
export const kitchenCircleGroceryScope = pgEnum('kitchen_circle_grocery_scope', ['week', 'day']);
export const kitchenCircleGroceryStatus = pgEnum('kitchen_circle_grocery_status', ['draft', 'finalized', 'discarded']);
export const kitchenCircleGroceryLineKind = pgEnum('kitchen_circle_grocery_line_kind', ['recipe', 'pantry', 'optional', 'manual']);
export const kitchenCircleGroceryLineStatus = pgEnum('kitchen_circle_grocery_line_status', ['buy', 'skipped', 'already_have']);

/** A solo or shared household which owns its KitchenCircle plans and rules. */
export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  defaultServings: integer('default_servings').notNull().default(1),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('idx_households_owner').on(t.ownerUserId)]);

/** Membership is deliberately separate from the owner column for portable household permissions. */
export const householdMembers = pgTable('household_members', {
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: kitchenCircleMemberRole('role').notNull().default('member'),
  language: varchar('language', { length: 20 }).notNull().default('en'),
  joinedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.householdId, t.userId] }), index('idx_household_members_user').on(t.userId)]);

/** Private, member-authored planning preferences; never exposes private MoodFood history. */
export const memberFoodPreferences = pgTable('member_food_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  strength: kitchenCirclePreferenceStrength('strength').notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [unique().on(t.householdId, t.userId, t.strength, t.category, t.value), index('idx_member_food_preferences_member').on(t.householdId, t.userId)]);

/** Account-bound invitations; public cook links intentionally use a separate Phase 8 model. */
export const householdInvites = pgTable('household_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  invitedByUserId: uuid('invited_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  role: kitchenCircleMemberRole('role').notNull().default('member'),
  token: uuid('token').notNull().defaultRandom().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('idx_household_invites_household').on(t.householdId), index('idx_household_invites_email').on(t.email)]);

/** Explicit recurring constraints; one-off slot changes remain in planner activity. */
export const householdRules = pgTable('household_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  weekday: integer('weekday'),
  strength: kitchenCircleRuleStrength('strength').notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  constraint: jsonb('constraint').$type<Record<string, unknown>>().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('idx_household_rules_household').on(t.householdId)]);

/** Stable recipe identity; executable ingredients and method live in immutable versions. */
export const recipes = pgTable('recipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  source: kitchenCircleRecipeSource('source').notNull().default('catalog'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});
export const recipeVersions = pgTable('recipe_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  defaultServings: integer('default_servings').notNull(),
  ingredients: jsonb('ingredients').$type<Array<{ name: string; canonicalName?: string; quantity: number; unit: string; optional?: boolean }>>().notNull(),
  steps: jsonb('steps').$type<string[]>().notNull(),
  prepMinutes: integer('prep_minutes'),
  cookMinutes: integer('cook_minutes'),
  cuisine: varchar('cuisine', { length: 50 }),
  effort: varchar('effort', { length: 20 }),
  freshnessClass: varchar('freshness_class', { length: 20 }),
  dietaryTags: jsonb('dietary_tags').$type<string[]>().notNull().default([]),
  allergens: jsonb('allergens').$type<string[]>().notNull().default([]),
  /** Who asserted the dietary/allergen tags: `catalog` (curated), `household` (self-declared), or `ai` (unverified). */
  dietaryProvenance: varchar('dietary_provenance', { length: 20 }).notNull().default('household'),
  substitutions: jsonb('substitutions').$type<Array<{ ingredient: string; alternatives: string[] }>>().notNull().default([]),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [unique().on(t.recipeId, t.version)]);
export const householdRecipes = pgTable('household_recipes', {
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  private: boolean('private').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.householdId, t.recipeId] })]);

/** One plan per household per Monday–Sunday calendar week. */
export const mealPlans = pgTable('meal_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  weekStart: date('week_start', { mode: 'string' }).notNull(),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  weekEnd: date('week_end', { mode: 'string' }).notNull(),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [unique().on(t.householdId, t.weekStart), index('idx_meal_plans_household_week').on(t.householdId, t.weekStart)]);

/** One shared daily meal decision, optionally bound to an immutable recipe version. */
export const mealSlots = pgTable('meal_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => mealPlans.id, { onDelete: 'cascade' }),
  plannedFor: date('planned_for', { mode: 'string' }).notNull(),
  state: kitchenCircleSlotState('state').notNull().default('blank'),
  mealTitle: varchar('meal_title', { length: 255 }),
  recipeVersionId: uuid('recipe_version_id').references(() => recipeVersions.id, { onDelete: 'set null' }),
  servings: integer('servings').notNull(),
  notes: text('notes'),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedByUserId: uuid('locked_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [unique().on(t.planId, t.plannedFor), index('idx_meal_slots_plan_day').on(t.planId, t.plannedFor)]);

/** A member's lightweight response to a proposed or unlocked meal. */
export const slotReactions = pgTable('slot_reactions', {
  slotId: uuid('slot_id').notNull().references(() => mealSlots.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reaction: kitchenCircleReaction('reaction').notNull(),
  reason: varchar('reason', { length: 500 }),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.slotId, t.userId] })]);

/** Each member controls their own attendance for a planned household meal. Missing means attending by default. */
export const slotAttendance = pgTable('slot_attendance', {
  slotId: uuid('slot_id').notNull().references(() => mealSlots.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: kitchenCircleAttendanceStatus('status').notNull(),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.slotId, t.userId] }), index('idx_slot_attendance_user').on(t.userId)]);

/** Household overrides on top of the built-in staple list (`DEFAULT_PANTRY`): add a staple or remove a default. */
export const householdPantryDefaults = pgTable('household_pantry_defaults', {
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  canonicalName: varchar('canonical_name', { length: 120 }).notNull(),
  inPantry: boolean('in_pantry').notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.householdId, t.canonicalName] })]);

/**
 * A grocery requirement computed once from bound recipe versions. Later plan edits never rewrite it;
 * drafts accept manual line edits, finalized snapshots are fully immutable.
 */
export const grocerySnapshots = pgTable('grocery_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => mealPlans.id, { onDelete: 'cascade' }),
  scope: kitchenCircleGroceryScope('scope').notNull(),
  scopeDate: date('scope_date', { mode: 'string' }),
  referenceDate: date('reference_date', { mode: 'string' }).notNull(),
  status: kitchenCircleGroceryStatus('status').notNull().default('draft'),
  /** `split` separates buy-now from buy-later perishables; `all_now` orders everything anyway. */
  freshnessMode: varchar('freshness_mode', { length: 10 }).notNull().default('split'),
  budgetPaise: integer('budget_paise'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  finalizedByUserId: uuid('finalized_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('idx_grocery_snapshots_household').on(t.householdId, t.createdAt.desc()), index('idx_grocery_snapshots_plan').on(t.planId)]);

/** One aggregate ingredient requirement with a full day/recipe source trace. */
export const grocerySnapshotLines = pgTable('grocery_snapshot_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotId: uuid('snapshot_id').notNull().references(() => grocerySnapshots.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  canonicalName: varchar('canonical_name', { length: 120 }).notNull(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  dimension: varchar('dimension', { length: 10 }),
  baseQuantity: doublePrecision('base_quantity'),
  quantity: doublePrecision('quantity'),
  unit: varchar('unit', { length: 20 }),
  originalQuantity: doublePrecision('original_quantity'),
  originalUnit: varchar('original_unit', { length: 20 }),
  kind: kitchenCircleGroceryLineKind('kind').notNull(),
  status: kitchenCircleGroceryLineStatus('status').notNull(),
  required: boolean('required').notNull(),
  freshnessGroup: varchar('freshness_group', { length: 10 }).notNull().default('buy_now'),
  unitConflict: boolean('unit_conflict').notNull().default(false),
  firstNeededOn: date('first_needed_on', { mode: 'string' }),
  sources: jsonb('sources').$type<Array<Record<string, unknown>>>().notNull().default([]),
  manuallyChanged: boolean('manually_changed').notNull().default(false),
  productNote: varchar('product_note', { length: 255 }),
  estimatedPricePaise: integer('estimated_price_paise'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('idx_grocery_snapshot_lines_snapshot').on(t.snapshotId, t.position)]);

/**
 * Which plan days a snapshot buys for. At most one active, non-override coverage per day prevents
 * buying the same meal twice; discarding a draft releases its coverage.
 */
export const groceryCoverage = pgTable('grocery_coverage', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotId: uuid('snapshot_id').notNull().references(() => grocerySnapshots.id, { onDelete: 'cascade' }),
  slotId: uuid('slot_id').notNull().references(() => mealSlots.id, { onDelete: 'cascade' }),
  plannedFor: date('planned_for', { mode: 'string' }).notNull(),
  /** The version and servings bought for; compared with the live slot to detect later plan changes. */
  recipeVersionId: uuid('recipe_version_id').notNull(),
  servings: integer('servings').notNull(),
  override: boolean('override').notNull().default(false),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index('idx_grocery_coverage_snapshot').on(t.snapshotId),
  uniqueIndex('uq_grocery_coverage_active_slot').on(t.slotId).where(sql`${t.override} = false and ${t.releasedAt} is null`),
]);

/** Records material plan changes so collaboration remains understandable and auditable. */
export const plannerActivities = pgTable('planner_activities', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').references(() => mealPlans.id, { onDelete: 'cascade' }),
  slotId: uuid('slot_id').references(() => mealSlots.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  before: jsonb('before').$type<Record<string, unknown>>(),
  after: jsonb('after').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
}, (t) => [index('idx_planner_activities_household').on(t.householdId, t.createdAt.desc())]);

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
    /** Last order-history check (throttles re-imports; Swiggy only shows the latest few orders). */
    historySyncedAt: timestamp('history_synced_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.swiggyUserId), index('idx_swiggy_tokens_user').on(t.userId, t.isActive)],
);

/**
 * Swiggy orders seen for a user, accumulated across imports (Swiggy exposes only
 * the most recent few). Items carry dish mapping + item profile; no delivery
 * address, phone or payment details are ever stored.
 */
export const swiggyOrders = pgTable(
  'swiggy_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    swiggyOrderId: varchar('swiggy_order_id', { length: 64 }).notNull(),
    orderedAt: timestamp('ordered_at', { withTimezone: true }),
    mealSlot: varchar('meal_slot', { length: 20 }),
    weekday: varchar('weekday', { length: 12 }),
    restaurantId: varchar('restaurant_id', { length: 64 }),
    restaurantName: varchar('restaurant_name', { length: 255 }),
    restaurantArea: varchar('restaurant_area', { length: 255 }),
    totalInr: integer('total_inr'),
    items: jsonb('items').notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.swiggyOrderId), index('idx_swiggy_orders_user').on(t.userId, t.orderedAt)],
);

/**
 * Instamart (grocery) orders, a separate stream from food delivery: what the
 * household buys and how it cooks. Items carry a grocery profile; no address,
 * phone or payment details are stored.
 */
export const instamartOrders = pgTable(
  'instamart_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    swiggyOrderId: varchar('swiggy_order_id', { length: 64 }).notNull(),
    orderedAt: timestamp('ordered_at', { withTimezone: true }),
    orderType: varchar('order_type', { length: 32 }),
    storeName: varchar('store_name', { length: 255 }),
    totalInr: integer('total_inr'),
    items: jsonb('items').notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.swiggyOrderId), index('idx_instamart_orders_user').on(t.userId, t.orderedAt)],
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
    /** Client retry guard: re-sent batches hit the unique index and are skipped. */
    dedupeKey: varchar('dedupe_key', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_signals_user').on(t.userId, t.id),
    uniqueIndex('uq_signals_user_dedupe').on(t.userId, t.dedupeKey),
  ],
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
