CREATE TYPE "public"."kitchen_circle_feedback_outcome" AS ENUM('loved', 'change', 'skipped', 'moved');--> statement-breakpoint
CREATE TABLE "cook_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"slot_id" uuid,
	"token_hash" varchar(64) NOT NULL,
	"language" varchar(12) DEFAULT 'en' NOT NULL,
	"transliterate" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cook_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "cook_translations" (
	"cache_key" varchar(64) PRIMARY KEY NOT NULL,
	"language" varchar(12) NOT NULL,
	"transliterate" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_member_settings" (
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"notify_changes" boolean DEFAULT true NOT NULL,
	"notify_weekend" boolean DEFAULT true NOT NULL,
	"notify_today_meal" boolean DEFAULT false NOT NULL,
	"cook_language" varchar(12) DEFAULT 'en' NOT NULL,
	"cook_transliterate" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_member_settings_household_id_user_id_pk" PRIMARY KEY("household_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "meal_feedback" (
	"slot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"outcome" "kitchen_circle_feedback_outcome" NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_feedback_slot_id_user_id_pk" PRIMARY KEY("slot_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "cook_links" ADD CONSTRAINT "cook_links_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_links" ADD CONSTRAINT "cook_links_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_links" ADD CONSTRAINT "cook_links_slot_id_meal_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."meal_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_links" ADD CONSTRAINT "cook_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_member_settings" ADD CONSTRAINT "household_member_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_member_settings" ADD CONSTRAINT "household_member_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_slot_id_meal_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."meal_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cook_links_household" ON "cook_links" USING btree ("household_id","created_at" DESC NULLS LAST);