CREATE TYPE "public"."kitchen_circle_cart_status" AS ENUM('preview', 'superseded', 'cart_written', 'payment_pending', 'ordered', 'failed');--> statement-breakpoint
CREATE TABLE "grocery_cart_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"address_id" varchar(100),
	"scope" varchar(10) NOT NULL,
	"status" "kitchen_circle_cart_status" DEFAULT 'preview' NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cart" jsonb,
	"order" jsonb,
	"created_by_user_id" uuid,
	"cart_written_by_user_id" uuid,
	"cart_written_at" timestamp with time zone,
	"ordered_by_user_id" uuid,
	"ordered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_delivery_settings" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(20) DEFAULT 'instamart' NOT NULL,
	"address_id" varchar(100) NOT NULL,
	"address_label" varchar(255) NOT NULL,
	"set_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grocery_cart_proposals" ADD CONSTRAINT "grocery_cart_proposals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_cart_proposals" ADD CONSTRAINT "grocery_cart_proposals_snapshot_id_grocery_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."grocery_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_cart_proposals" ADD CONSTRAINT "grocery_cart_proposals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_cart_proposals" ADD CONSTRAINT "grocery_cart_proposals_cart_written_by_user_id_users_id_fk" FOREIGN KEY ("cart_written_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_cart_proposals" ADD CONSTRAINT "grocery_cart_proposals_ordered_by_user_id_users_id_fk" FOREIGN KEY ("ordered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_delivery_settings" ADD CONSTRAINT "household_delivery_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_delivery_settings" ADD CONSTRAINT "household_delivery_settings_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_grocery_cart_proposals_snapshot" ON "grocery_cart_proposals" USING btree ("snapshot_id","created_at" DESC NULLS LAST);