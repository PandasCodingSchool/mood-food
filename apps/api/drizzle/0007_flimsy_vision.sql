CREATE TYPE "public"."kitchen_circle_attendance_status" AS ENUM('attending', 'absent');--> statement-breakpoint
CREATE TABLE "slot_attendance" (
	"slot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "kitchen_circle_attendance_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_attendance_slot_id_user_id_pk" PRIMARY KEY("slot_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "slot_attendance" ADD CONSTRAINT "slot_attendance_slot_id_meal_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."meal_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_attendance" ADD CONSTRAINT "slot_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_slot_attendance_user" ON "slot_attendance" USING btree ("user_id");