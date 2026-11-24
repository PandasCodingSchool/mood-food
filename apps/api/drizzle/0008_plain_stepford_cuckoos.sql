CREATE TYPE "public"."kitchen_circle_rule_strength" AS ENUM('hard', 'preference', 'contextual');--> statement-breakpoint
CREATE TABLE "household_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"weekday" integer,
	"strength" "kitchen_circle_rule_strength" NOT NULL,
	"category" varchar(50) NOT NULL,
	"constraint" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_rules" ADD CONSTRAINT "household_rules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_rules" ADD CONSTRAINT "household_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_household_rules_household" ON "household_rules" USING btree ("household_id");