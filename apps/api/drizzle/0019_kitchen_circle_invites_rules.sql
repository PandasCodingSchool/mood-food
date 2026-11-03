ALTER TABLE "household_invites" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_invites" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "household_rules" ADD COLUMN "applies_to_week_start" date;--> statement-breakpoint
CREATE INDEX "idx_household_invites_phone" ON "household_invites" USING btree ("phone");