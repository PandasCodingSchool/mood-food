CREATE TABLE "swiggy_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"swiggy_order_id" varchar(64) NOT NULL,
	"ordered_at" timestamp with time zone,
	"meal_slot" varchar(20),
	"weekday" varchar(12),
	"restaurant_id" varchar(64),
	"restaurant_name" varchar(255),
	"restaurant_area" varchar(255),
	"total_inr" integer,
	"items" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swiggy_orders_user_id_swiggy_order_id_unique" UNIQUE("user_id","swiggy_order_id")
);
--> statement-breakpoint
ALTER TABLE "swiggy_user_tokens" ADD COLUMN "history_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "swiggy_orders" ADD CONSTRAINT "swiggy_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_swiggy_orders_user" ON "swiggy_orders" USING btree ("user_id","ordered_at");