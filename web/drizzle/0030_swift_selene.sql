ALTER TABLE "event_activity" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "event_messages" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "event_messages" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "event_messages" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "event_messages" ADD COLUMN "turn_counted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_notes" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "event_options" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "guest_tasks" ADD COLUMN "token_encrypted" text;--> statement-breakpoint
ALTER TABLE "guest_tasks" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "sage_jobs" ADD COLUMN "payload_encrypted" text;--> statement-breakpoint
ALTER TABLE "sage_jobs" ADD COLUMN "result_encrypted" text;--> statement-breakpoint
CREATE UNIQUE INDEX "event_activity_event_idempotency_uidx" ON "event_activity" USING btree ("event_id","idempotency_key") WHERE "event_activity"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_messages_event_idempotency_uidx" ON "event_messages" USING btree ("event_id","idempotency_key") WHERE "event_messages"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_notes_event_idempotency_uidx" ON "event_notes" USING btree ("event_id","idempotency_key") WHERE "event_notes"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_options_event_idempotency_uidx" ON "event_options" USING btree ("event_id","idempotency_key") WHERE "event_options"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "events_organizer_idempotency_uidx" ON "events" USING btree ("organizer_user_id","idempotency_key") WHERE "events"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_tasks_organizer_idempotency_uidx" ON "guest_tasks" USING btree ("organizer_user_id","idempotency_key") WHERE "guest_tasks"."idempotency_key" is not null;