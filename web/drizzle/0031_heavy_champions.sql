CREATE TYPE "public"."discovery_recommendation_status" AS ENUM('active', 'dismissed', 'requested');--> statement-breakpoint
CREATE TABLE "discovery_cadences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"intent_slug" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"interval_hours" integer DEFAULT 168 NOT NULL,
	"max_recommendations" integer DEFAULT 3 NOT NULL,
	"notify_on_new" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_job_id" uuid,
	"last_outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_cadences_interval_check" CHECK ("discovery_cadences"."interval_hours" between 24 and 720),
	CONSTRAINT "discovery_cadences_limit_check" CHECK ("discovery_cadences"."max_recommendations" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "discovery_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"candidate_user_id" uuid NOT NULL,
	"requester_enrollment_id" uuid NOT NULL,
	"candidate_enrollment_id" uuid NOT NULL,
	"intent_slug" text NOT NULL,
	"compatibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"projection" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "discovery_recommendation_status" DEFAULT 'active' NOT NULL,
	"source_job_id" uuid,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discovery_cadences" ADD CONSTRAINT "discovery_cadences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_recommendations" ADD CONSTRAINT "discovery_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_recommendations" ADD CONSTRAINT "discovery_recommendations_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_recommendations" ADD CONSTRAINT "discovery_recommendations_requester_enrollment_id_purpose_enrollments_id_fk" FOREIGN KEY ("requester_enrollment_id") REFERENCES "public"."purpose_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_recommendations" ADD CONSTRAINT "discovery_recommendations_candidate_enrollment_id_purpose_enrollments_id_fk" FOREIGN KEY ("candidate_enrollment_id") REFERENCES "public"."purpose_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_cadences_user_intent_uidx" ON "discovery_cadences" USING btree ("user_id","intent_slug");--> statement-breakpoint
CREATE INDEX "discovery_cadences_due_idx" ON "discovery_cadences" USING btree ("next_run_at") WHERE "discovery_cadences"."enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_recommendations_user_candidate_uidx" ON "discovery_recommendations" USING btree ("user_id","intent_slug","candidate_user_id");--> statement-breakpoint
CREATE INDEX "discovery_recommendations_owner_status_idx" ON "discovery_recommendations" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "discovery_recommendations_expiry_idx" ON "discovery_recommendations" USING btree ("expires_at");