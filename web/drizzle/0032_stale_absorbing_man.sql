DROP INDEX "notification_outbox_pending_idx";--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "leased_by" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("scheduled_for","lease_expires_at") WHERE "notification_outbox"."sent_at" is null;