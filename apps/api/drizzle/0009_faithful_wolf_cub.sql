CREATE TYPE "public"."kitchen_circle_preference_strength" AS ENUM('cannot_eat', 'never_plan', 'prefer_less', 'favourite');--> statement-breakpoint
CREATE TYPE "public"."kitchen_circle_reaction" AS ENUM('looks_good', 'not_for_me');--> statement-breakpoint
CREATE TABLE "member_food_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"strength" "kitchen_circle_preference_strength" NOT NULL,
	"category" varchar(50) NOT NULL,
	"value" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_food_preferences_household_id_user_id_strength_category_value_unique" UNIQUE("household_id","user_id","strength","category","value")
);
--> statement-breakpoint
CREATE TABLE "slot_reactions" (
	"slot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reaction" "kitchen_circle_reaction" NOT NULL,
	"reason" varchar(500),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_reactions_slot_id_user_id_pk" PRIMARY KEY("slot_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "member_food_preferences" ADD CONSTRAINT "member_food_preferences_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_food_preferences" ADD CONSTRAINT "member_food_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_reactions" ADD CONSTRAINT "slot_reactions_slot_id_meal_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."meal_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_reactions" ADD CONSTRAINT "slot_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_member_food_preferences_member" ON "member_food_preferences" USING btree ("household_id","user_id");