CREATE TABLE "instamart_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"swiggy_order_id" varchar(64) NOT NULL,
	"ordered_at" timestamp with time zone,
	"order_type" varchar(32),
	"store_name" varchar(255),
	"total_inr" integer,
	"items" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instamart_orders_user_id_swiggy_order_id_unique" UNIQUE("user_id","swiggy_order_id")
);
--> statement-breakpoint
ALTER TABLE "instamart_orders" ADD CONSTRAINT "instamart_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_instamart_orders_user" ON "instamart_orders" USING btree ("user_id","ordered_at");