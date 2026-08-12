ALTER TABLE "links" ADD COLUMN "confirm_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "allowed_hours" jsonb;--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('organizer', 'invitee');--> statement-breakpoint
CREATE TABLE "session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "participant_role" DEFAULT 'invitee' NOT NULL,
	"link_id" uuid,
	"vote_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"google_account_email" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"scopes" text,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_participants_session_user_uidx" ON "session_participants" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "session_participants_session_id_idx" ON "session_participants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_participants_user_id_idx" ON "session_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connections_user_provider_uidx" ON "calendar_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "calendar_connections_user_id_idx" ON "calendar_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_status_idx" ON "sessions" USING btree ("status");
