ALTER TABLE "signals" ADD COLUMN "dedupe_key" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_signals_user_dedupe" ON "signals" USING btree ("user_id","dedupe_key");