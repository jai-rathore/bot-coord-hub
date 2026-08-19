ALTER TABLE "event_participants" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "event_participants_user_archived_idx" ON "event_participants" USING btree ("user_id","archived_at");
