CREATE TYPE "public"."kitchen_circle_proposal_item_status" AS ENUM('proposed', 'applied', 'stale');--> statement-breakpoint
CREATE TYPE "public"."kitchen_circle_proposal_status" AS ENUM('pending', 'applied', 'discarded', 'superseded');--> statement-breakpoint
CREATE TABLE "meal_plan_proposal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"planned_for" date NOT NULL,
	"recipe_id" uuid NOT NULL,
	"recipe_version_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"source" varchar(20) NOT NULL,
	"score" double precision NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_recipe_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"servings" integer NOT NULL,
	"slot_updated_at" timestamp with time zone NOT NULL,
	"status" "kitchen_circle_proposal_item_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_plan_proposal_items_proposal_id_slot_id_unique" UNIQUE("proposal_id","slot_id")
);
--> statement-breakpoint
CREATE TABLE "meal_plan_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"status" "kitchen_circle_proposal_status" DEFAULT 'pending' NOT NULL,
	"seed" integer DEFAULT 0 NOT NULL,
	"summary" text NOT NULL,
	"unfilled" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ignored_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planner_version" varchar(40) NOT NULL,
	"created_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_plan_proposal_items" ADD CONSTRAINT "meal_plan_proposal_items_proposal_id_meal_plan_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."meal_plan_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_proposal_items" ADD CONSTRAINT "meal_plan_proposal_items_slot_id_meal_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."meal_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_proposals" ADD CONSTRAINT "meal_plan_proposals_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_proposals" ADD CONSTRAINT "meal_plan_proposals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_proposals" ADD CONSTRAINT "meal_plan_proposals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_meal_plan_proposal_items_proposal" ON "meal_plan_proposal_items" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_meal_plan_proposals_plan" ON "meal_plan_proposals" USING btree ("plan_id","created_at" DESC NULLS LAST);