ALTER TABLE "recipe_versions" ADD COLUMN "cuisine" varchar(50);--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "effort" varchar(20);--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "freshness_class" varchar(20);--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "dietary_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "allergens" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "dietary_provenance" varchar(20) DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "substitutions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;