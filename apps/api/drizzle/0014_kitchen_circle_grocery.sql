CREATE TYPE "public"."kitchen_circle_grocery_line_kind" AS ENUM('recipe', 'pantry', 'optional', 'manual');--> statement-breakpoint
CREATE TYPE "public"."kitchen_circle_grocery_line_status" AS ENUM('buy', 'skipped', 'already_have');--> statement-breakpoint
CREATE TYPE "public"."kitchen_circle_grocery_scope" AS ENUM('week', 'day');--> statement-breakpoint
CREATE TYPE "public"."kitchen_circle_grocery_status" AS ENUM('draft', 'finalized', 'discarded');--> statement-breakpoint
CREATE TABLE "grocery_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"planned_for" date NOT NULL,
	"recipe_version_id" uuid NOT NULL,
	"servings" integer NOT NULL,
	"override" boolean DEFAULT false NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grocery_snapshot_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"canonical_name" varchar(120) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"dimension" varchar(10),
	"base_quantity" double precision,
	"quantity" double precision,
	"unit" varchar(20),
	"original_quantity" double precision,
	"original_unit" varchar(20),
	"kind" "kitchen_circle_grocery_line_kind" NOT NULL,
	"status" "kitchen_circle_grocery_line_status" NOT NULL,
	"required" boolean NOT NULL,
	"freshness_group" varchar(10) DEFAULT 'buy_now' NOT NULL,
	"unit_conflict" boolean DEFAULT false NOT NULL,
	"first_needed_on" date,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manually_changed" boolean DEFAULT false NOT NULL,
	"product_note" varchar(255),
	"estimated_price_paise" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grocery_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"scope" "kitchen_circle_grocery_scope" NOT NULL,
	"scope_date" date,
	"reference_date" date NOT NULL,
	"status" "kitchen_circle_grocery_status" DEFAULT 'draft' NOT NULL,
	"freshness_mode" varchar(10) DEFAULT 'split' NOT NULL,
	"budget_paise" integer,
	"created_by_user_id" uuid,
	"finalized_at" timestamp with time zone,
	"finalized_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_pantry_defaults" (
	"household_id" uuid NOT NULL,
	"canonical_name" varchar(120) NOT NULL,
	"in_pantry" boolean NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_pantry_defaults_household_id_canonical_name_pk" PRIMARY KEY("household_id","canonical_name")
);
--> statement-breakpoint
ALTER TABLE "grocery_coverage" ADD CONSTRAINT "grocery_coverage_snapshot_id_grocery_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."grocery_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_coverage" ADD CONSTRAINT "grocery_coverage_slot_id_meal_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."meal_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_snapshot_lines" ADD CONSTRAINT "grocery_snapshot_lines_snapshot_id_grocery_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."grocery_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_snapshots" ADD CONSTRAINT "grocery_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_snapshots" ADD CONSTRAINT "grocery_snapshots_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_snapshots" ADD CONSTRAINT "grocery_snapshots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_snapshots" ADD CONSTRAINT "grocery_snapshots_finalized_by_user_id_users_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_pantry_defaults" ADD CONSTRAINT "household_pantry_defaults_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_pantry_defaults" ADD CONSTRAINT "household_pantry_defaults_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_grocery_coverage_snapshot" ON "grocery_coverage" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_grocery_coverage_active_slot" ON "grocery_coverage" USING btree ("slot_id") WHERE "grocery_coverage"."override" = false and "grocery_coverage"."released_at" is null;--> statement-breakpoint
CREATE INDEX "idx_grocery_snapshot_lines_snapshot" ON "grocery_snapshot_lines" USING btree ("snapshot_id","position");--> statement-breakpoint
CREATE INDEX "idx_grocery_snapshots_household" ON "grocery_snapshots" USING btree ("household_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_grocery_snapshots_plan" ON "grocery_snapshots" USING btree ("plan_id");