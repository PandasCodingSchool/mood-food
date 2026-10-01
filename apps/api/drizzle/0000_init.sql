CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_name" varchar(255) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_id" uuid,
	"user_agent" text,
	"ip_address" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_agent" text,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "campaigns_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "diy_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dish_name" varchar(255) NOT NULL,
	"recipe" jsonb NOT NULL,
	"ingredient_cart" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"matched_products" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_steps" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"instamart_order_id" varchar(255),
	"status" varchar(50) DEFAULT 'cart' NOT NULL,
	"wall_photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" integer NOT NULL,
	"member_key" varchar(100) NOT NULL,
	"user_id" uuid,
	"display_name" varchar(100),
	"swipes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_member_key_pk" PRIMARY KEY("group_id","member_key")
);
--> statement-breakpoint
CREATE TABLE "group_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"host_user_id" uuid,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_sessions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "mood_food_map" (
	"user_id" uuid NOT NULL,
	"mood_key" varchar(100) NOT NULL,
	"food_archetype" varchar(100) NOT NULL,
	"weight" real NOT NULL,
	"n_obs" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mood_food_map_user_id_mood_key_food_archetype_pk" PRIMARY KEY("user_id","mood_key","food_archetype")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) DEFAULT 'info' NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"dish_name" varchar(255) NOT NULL,
	"dish_type" varchar(50) DEFAULT 'main' NOT NULL,
	"platform" varchar(50) DEFAULT 'swiggy' NOT NULL,
	"user_agent" text,
	"ip_address" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dish_name" varchar(255) NOT NULL,
	"cuisine" varchar(100),
	"emoji" text DEFAULT '🍽️' NOT NULL,
	"price_inr" integer DEFAULT 0 NOT NULL,
	"platform" varchar(50) DEFAULT 'swiggy' NOT NULL,
	"via" varchar(100),
	"gradient_start" varchar(20) DEFAULT '#f97316' NOT NULL,
	"gradient_end" varchar(20) DEFAULT '#fbbf24' NOT NULL,
	"ordered" boolean DEFAULT true NOT NULL,
	"saved" boolean DEFAULT false NOT NULL,
	"swiggy_order_id" varchar(255),
	"restaurant_id" varchar(255),
	"menu_item_id" varchar(255),
	"address_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rec_id" varchar(255) NOT NULL,
	"dish_id" varchar(255),
	"dish_name" varchar(255),
	"predicted_score" real,
	"confidence" real,
	"user_predicted_score" real,
	"actual_score" real,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quests_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "quiz_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"mood" varchar(50) NOT NULL,
	"craving" varchar(50) NOT NULL,
	"budget" varchar(50) NOT NULL,
	"preference" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swiggy_user_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"swiggy_user_id" varchar(255) NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swiggy_user_tokens_user_id_swiggy_user_id_unique" UNIQUE("user_id","swiggy_user_id")
);
--> statement-breakpoint
CREATE TABLE "taste_vector" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"embedding" jsonb NOT NULL,
	"dim" integer NOT NULL,
	"model_version" varchar(100),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"diets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cuisines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_quests" (
	"user_id" uuid NOT NULL,
	"quest_id" integer NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"streak_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_quests_user_id_quest_id_pk" PRIMARY KEY("user_id","quest_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"name" varchar(255),
	"password_hash" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"persona_archetype" varchar(100),
	"question_budget" integer DEFAULT 3 NOT NULL,
	"automation_pref" varchar(50) DEFAULT 'balanced' NOT NULL,
	"comfort_anchors" jsonb,
	"push_token" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"city" varchar(255),
	"cuisine" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diy_sessions" ADD CONSTRAINT "diy_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_group_sessions_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mood_food_map" ADD CONSTRAINT "mood_food_map_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swiggy_user_tokens" ADD CONSTRAINT "swiggy_user_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_vector" ADD CONSTRAINT "taste_vector_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quests" ADD CONSTRAINT "user_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quests" ADD CONSTRAINT "user_quests_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_analytics_events_name" ON "analytics_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_created" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_auth_sessions_user" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_diy_sessions_user" ON "diy_sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_clicks_created" ON "order_clicks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_order_clicks_dish" ON "order_clicks" USING btree ("dish_name");--> statement-breakpoint
CREATE INDEX "idx_order_history_user" ON "order_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_predictions_user" ON "predictions" USING btree ("user_id","resolved_at");--> statement-breakpoint
CREATE INDEX "idx_quiz_completions_created" ON "quiz_completions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_signals_user" ON "signals" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "idx_swiggy_tokens_user" ON "swiggy_user_tokens" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_waitlist_created" ON "waitlist" USING btree ("created_at");