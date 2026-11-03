CREATE TYPE "public"."kitchen_circle_action_status" AS ENUM('applied', 'needs_confirmation', 'needs_clarification', 'confirmed', 'rejected', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."kitchen_circle_chat_role" AS ENUM('member', 'assistant');--> statement-breakpoint
CREATE TABLE "planner_action_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"plan_id" uuid,
	"message_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"action_type" varchar(40),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "kitchen_circle_action_status" NOT NULL,
	"policy" varchar(40) NOT NULL,
	"policy_note" text,
	"clarification" jsonb,
	"result" jsonb,
	"slot_updated_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"plan_id" uuid,
	"author_user_id" uuid,
	"role" "kitchen_circle_chat_role" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planner_action_proposals" ADD CONSTRAINT "planner_action_proposals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_action_proposals" ADD CONSTRAINT "planner_action_proposals_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_action_proposals" ADD CONSTRAINT "planner_action_proposals_message_id_planner_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."planner_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_action_proposals" ADD CONSTRAINT "planner_action_proposals_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_action_proposals" ADD CONSTRAINT "planner_action_proposals_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_messages" ADD CONSTRAINT "planner_messages_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_messages" ADD CONSTRAINT "planner_messages_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_messages" ADD CONSTRAINT "planner_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_planner_action_proposals_household" ON "planner_action_proposals" USING btree ("household_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_planner_action_proposals_message" ON "planner_action_proposals" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_planner_messages_household" ON "planner_messages" USING btree ("household_id","created_at" DESC NULLS LAST);