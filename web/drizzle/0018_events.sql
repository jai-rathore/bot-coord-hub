CREATE TYPE "public"."event_agent_mode" AS ENUM('hosted', 'byo', 'none');
--> statement-breakpoint
CREATE TYPE "public"."event_attendance" AS ENUM('pending', 'yes', 'no', 'maybe');
--> statement-breakpoint
CREATE TYPE "public"."event_dimension_kind" AS ENUM('time', 'place', 'attendance', 'custom');
--> statement-breakpoint
CREATE TYPE "public"."event_dimension_mode" AS ENUM('fixed', 'open');
--> statement-breakpoint
CREATE TYPE "public"."event_lock_policy" AS ENUM('on_quorum', 'at_deadline', 'manual');
--> statement-breakpoint
CREATE TYPE "public"."event_pref" AS ENUM('yes', 'no', 'maybe');
--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'open', 'locked', 'confirmed', 'cancelled', 'expired');
--> statement-breakpoint
CREATE TYPE "public"."event_visibility" AS ENUM('open', 'counts_only', 'blind');
--> statement-breakpoint
CREATE TABLE "event_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "event_dimension_kind" NOT NULL,
	"label" text NOT NULL,
	"mode" "event_dimension_mode" NOT NULL,
	"resolution_rule" text DEFAULT 'max_attendance' NOT NULL,
	"resolved_option_id" uuid,
	"depends_on_dimension_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"dimension_id" uuid NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"label" text,
	"place_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capacity" integer,
	"created_by_role" text DEFAULT 'organizer' NOT NULL,
	"created_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "participant_role" DEFAULT 'invitee' NOT NULL,
	"attendance" "event_attendance" DEFAULT 'pending' NOT NULL,
	"chat_turns_used" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'share_link' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"dimension_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"value" "event_pref" NOT NULL,
	"note" text,
	"source" text DEFAULT 'ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"share_slug" text NOT NULL,
	"organizer_user_id" uuid NOT NULL,
	"session_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" "event_status" DEFAULT 'open' NOT NULL,
	"visibility" "event_visibility" DEFAULT 'open' NOT NULL,
	"lock_policy" "event_lock_policy" DEFAULT 'at_deadline' NOT NULL,
	"quorum_min" integer,
	"capacity_max" integer,
	"deadline_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"agent_mode" "event_agent_mode" DEFAULT 'hosted' NOT NULL,
	"agent_name" text DEFAULT 'Sage' NOT NULL,
	"allow_chat" boolean DEFAULT true NOT NULL,
	"allow_guest_options" boolean DEFAULT true NOT NULL,
	"outcome" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_quorum_min_check" CHECK ("events"."quorum_min" is null or "events"."quorum_min" >= 1),
	CONSTRAINT "events_capacity_max_check" CHECK ("events"."capacity_max" is null or "events"."capacity_max" >= 1)
);
--> statement-breakpoint
ALTER TABLE "event_activity" ADD CONSTRAINT "event_activity_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_activity" ADD CONSTRAINT "event_activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_dimensions" ADD CONSTRAINT "event_dimensions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_options" ADD CONSTRAINT "event_options_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_options" ADD CONSTRAINT "event_options_dimension_id_event_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."event_dimensions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_options" ADD CONSTRAINT "event_options_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_participant_id_event_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."event_participants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_dimension_id_event_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."event_dimensions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_responses" ADD CONSTRAINT "event_responses_option_id_event_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."event_options"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_user_id_users_id_fk" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "event_activity_event_created_idx" ON "event_activity" USING btree ("event_id","created_at");
--> statement-breakpoint
CREATE INDEX "event_dimensions_event_idx" ON "event_dimensions" USING btree ("event_id","position");
--> statement-breakpoint
CREATE UNIQUE INDEX "event_dimensions_event_kind_uidx" ON "event_dimensions" USING btree ("event_id","kind");
--> statement-breakpoint
CREATE INDEX "event_options_event_dim_idx" ON "event_options" USING btree ("event_id","dimension_id","position");
--> statement-breakpoint
CREATE INDEX "event_options_dimension_idx" ON "event_options" USING btree ("dimension_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "event_participants_event_user_uidx" ON "event_participants" USING btree ("event_id","user_id");
--> statement-breakpoint
CREATE INDEX "event_participants_event_idx" ON "event_participants" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX "event_participants_user_idx" ON "event_participants" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "event_responses_participant_option_uidx" ON "event_responses" USING btree ("participant_id","option_id");
--> statement-breakpoint
CREATE INDEX "event_responses_event_option_idx" ON "event_responses" USING btree ("event_id","option_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "events_public_id_uidx" ON "events" USING btree ("public_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "events_share_slug_uidx" ON "events" USING btree ("share_slug");
--> statement-breakpoint
CREATE INDEX "events_organizer_idx" ON "events" USING btree ("organizer_user_id");
--> statement-breakpoint
CREATE INDEX "events_status_deadline_idx" ON "events" USING btree ("status","deadline_at");
