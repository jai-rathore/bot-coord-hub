CREATE TYPE "public"."discovery_enrollment_status" AS ENUM('draft', 'pending_approval', 'active', 'paused', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."discovery_interest_status" AS ENUM('pending', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."safety_report_status" AS ENUM('open', 'reviewed', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."user_safety_status" AS ENUM('active', 'restricted', 'suspended');--> statement-breakpoint
CREATE TABLE "agent_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"supported_intents" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_blocks_not_self_check" CHECK ("discovery_blocks"."blocker_user_id" <> "discovery_blocks"."blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "discovery_disclosures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interest_id" uuid NOT NULL,
	"grantor_user_id" uuid NOT NULL,
	"grantee_user_id" uuid NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discovery_handles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"candidate_user_id" uuid NOT NULL,
	"requester_enrollment_id" uuid NOT NULL,
	"candidate_enrollment_id" uuid NOT NULL,
	"intent_slug" text NOT NULL,
	"compatibility" jsonb NOT NULL,
	"projection" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_slug" text NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"requester_enrollment_id" uuid NOT NULL,
	"recipient_enrollment_id" uuid NOT NULL,
	"status" "discovery_interest_status" DEFAULT 'pending' NOT NULL,
	"compatibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text,
	"decided_at" timestamp with time zone,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purpose_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"intent_slug" text NOT NULL,
	"definition_version" integer NOT NULL,
	"status" "discovery_enrollment_status" DEFAULT 'draft' NOT NULL,
	"public_claims" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"private_claims_encrypted" text,
	"disclosure_claims" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"claim_provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"location_id" uuid,
	"submitted_by_api_key_id" uuid,
	"consented_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"interest_id" uuid,
	"reason_code" text NOT NULL,
	"details" text,
	"status" "safety_report_status" DEFAULT 'open' NOT NULL,
	"moderator_notes" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_reports_not_self_check" CHECK ("safety_reports"."reporter_user_id" <> "safety_reports"."subject_user_id")
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"country_code" text,
	"region" text,
	"locality" text,
	"neighborhood" text,
	"granularity" text DEFAULT 'city' NOT NULL,
	"visibility" text DEFAULT 'private_match' NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_locations_granularity_check" CHECK ("user_locations"."granularity" in ('country', 'region', 'city', 'neighborhood')),
	CONSTRAINT "user_locations_visibility_check" CHECK ("user_locations"."visibility" in ('private_match', 'disclose_after_match'))
);
--> statement-breakpoint
CREATE TABLE "user_safety" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "user_safety_status" DEFAULT 'active' NOT NULL,
	"reason_code" text,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intent_types" ADD COLUMN "definition_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "intent_types" ADD COLUMN "definition" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "intent_types" ADD COLUMN "discovery_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "intent_types" ADD COLUMN "handler" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_capabilities" ADD CONSTRAINT "agent_capabilities_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_blocks" ADD CONSTRAINT "discovery_blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_blocks" ADD CONSTRAINT "discovery_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_disclosures" ADD CONSTRAINT "discovery_disclosures_interest_id_discovery_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."discovery_interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_disclosures" ADD CONSTRAINT "discovery_disclosures_grantor_user_id_users_id_fk" FOREIGN KEY ("grantor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_disclosures" ADD CONSTRAINT "discovery_disclosures_grantee_user_id_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_handles" ADD CONSTRAINT "discovery_handles_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_handles" ADD CONSTRAINT "discovery_handles_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_handles" ADD CONSTRAINT "discovery_handles_requester_enrollment_id_purpose_enrollments_id_fk" FOREIGN KEY ("requester_enrollment_id") REFERENCES "public"."purpose_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_handles" ADD CONSTRAINT "discovery_handles_candidate_enrollment_id_purpose_enrollments_id_fk" FOREIGN KEY ("candidate_enrollment_id") REFERENCES "public"."purpose_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_interests" ADD CONSTRAINT "discovery_interests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_interests" ADD CONSTRAINT "discovery_interests_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_interests" ADD CONSTRAINT "discovery_interests_requester_enrollment_id_purpose_enrollments_id_fk" FOREIGN KEY ("requester_enrollment_id") REFERENCES "public"."purpose_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_interests" ADD CONSTRAINT "discovery_interests_recipient_enrollment_id_purpose_enrollments_id_fk" FOREIGN KEY ("recipient_enrollment_id") REFERENCES "public"."purpose_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_interests" ADD CONSTRAINT "discovery_interests_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purpose_enrollments" ADD CONSTRAINT "purpose_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purpose_enrollments" ADD CONSTRAINT "purpose_enrollments_location_id_user_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."user_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purpose_enrollments" ADD CONSTRAINT "purpose_enrollments_submitted_by_api_key_id_api_keys_id_fk" FOREIGN KEY ("submitted_by_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_interest_id_discovery_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."discovery_interests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_safety" ADD CONSTRAINT "user_safety_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_safety" ADD CONSTRAINT "user_safety_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_capabilities_api_key_uidx" ON "agent_capabilities" USING btree ("api_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_blocks_pair_uidx" ON "discovery_blocks" USING btree ("blocker_user_id","blocked_user_id");--> statement-breakpoint
CREATE INDEX "discovery_blocks_blocked_idx" ON "discovery_blocks" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_disclosures_interest_grantor_uidx" ON "discovery_disclosures" USING btree ("interest_id","grantor_user_id");--> statement-breakpoint
CREATE INDEX "discovery_disclosures_grantee_idx" ON "discovery_disclosures" USING btree ("grantee_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_handles_token_hash_uidx" ON "discovery_handles" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "discovery_handles_requester_expires_idx" ON "discovery_handles" USING btree ("requester_user_id","expires_at");--> statement-breakpoint
CREATE INDEX "discovery_handles_candidate_idx" ON "discovery_handles" USING btree ("candidate_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_interests_pair_uidx" ON "discovery_interests" USING btree ("intent_slug","requester_user_id","recipient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_interests_idempotency_uidx" ON "discovery_interests" USING btree ("requester_user_id","idempotency_key") WHERE "discovery_interests"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "discovery_interests_recipient_status_idx" ON "discovery_interests" USING btree ("recipient_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "discovery_interests_requester_idx" ON "discovery_interests" USING btree ("requester_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purpose_enrollments_user_intent_uidx" ON "purpose_enrollments" USING btree ("user_id","intent_slug");--> statement-breakpoint
CREATE INDEX "purpose_enrollments_discovery_idx" ON "purpose_enrollments" USING btree ("intent_slug","status","expires_at");--> statement-breakpoint
CREATE INDEX "purpose_enrollments_location_idx" ON "purpose_enrollments" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "safety_reports_subject_status_idx" ON "safety_reports" USING btree ("subject_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "safety_reports_reporter_idx" ON "safety_reports" USING btree ("reporter_user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_locations_user_id_idx" ON "user_locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_locations_coarse_idx" ON "user_locations" USING btree ("country_code","region","locality","neighborhood");--> statement-breakpoint
CREATE UNIQUE INDEX "user_locations_primary_uidx" ON "user_locations" USING btree ("user_id") WHERE "user_locations"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "user_safety_user_uidx" ON "user_safety" USING btree ("user_id");