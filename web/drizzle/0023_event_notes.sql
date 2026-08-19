CREATE TABLE "event_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"participant_id" uuid,
	"author_user_id" uuid,
	"option_id" uuid,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'everyone' NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"removed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_notes_visibility_check" CHECK ("event_notes"."visibility" in ('everyone', 'organizer')),
	CONSTRAINT "event_notes_source_check" CHECK ("event_notes"."source" in ('chat', 'ui')),
	CONSTRAINT "event_notes_status_check" CHECK ("event_notes"."status" in ('active', 'removed'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "notes_digest" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "notes_digest_key" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "notes_digest_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_notes" ADD CONSTRAINT "event_notes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notes" ADD CONSTRAINT "event_notes_participant_id_event_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."event_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notes" ADD CONSTRAINT "event_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notes" ADD CONSTRAINT "event_notes_option_id_event_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."event_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notes" ADD CONSTRAINT "event_notes_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_notes_event_created_idx" ON "event_notes" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "event_notes_event_status_idx" ON "event_notes" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "event_notes_author_idx" ON "event_notes" USING btree ("event_id","author_user_id");
