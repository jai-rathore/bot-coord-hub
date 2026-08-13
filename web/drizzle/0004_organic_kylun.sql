CREATE TYPE "public"."guest_task_status" AS ENUM('open', 'completed', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."guest_task_type" AS ENUM('binary_choice', 'text_response', 'availability');--> statement-breakpoint
CREATE TYPE "public"."pairing_status" AS ENUM('pending', 'approved', 'denied', 'consumed', 'expired');--> statement-breakpoint
CREATE TABLE "agent_pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code" text NOT NULL,
	"agent_name" text NOT NULL,
	"requested_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "pairing_status" DEFAULT 'pending' NOT NULL,
	"user_id" uuid,
	"api_key_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_task_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"response" jsonb NOT NULL,
	"submitter_email_hash" text,
	"client_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"organizer_user_id" uuid NOT NULL,
	"task_type" "guest_task_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"session_id" uuid,
	"target_email_hash" text,
	"status" "guest_task_status" DEFAULT 'open' NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"max_responses" integer DEFAULT 1 NOT NULL,
	"response_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "intent_proposals" ADD COLUMN "category" text DEFAULT 'coordination' NOT NULL;--> statement-breakpoint
ALTER TABLE "intent_types" ADD COLUMN "category" text DEFAULT 'coordination' NOT NULL;--> statement-breakpoint
ALTER TABLE "intent_types" ADD COLUMN "required_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_messages" ADD COLUMN "actor_api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "session_messages" ADD COLUMN "actor_kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "agent_pairings" ADD CONSTRAINT "agent_pairings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_pairings" ADD CONSTRAINT "agent_pairings_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_responses" ADD CONSTRAINT "guest_responses_guest_task_id_guest_tasks_id_fk" FOREIGN KEY ("guest_task_id") REFERENCES "public"."guest_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_tasks" ADD CONSTRAINT "guest_tasks_organizer_user_id_users_id_fk" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_tasks" ADD CONSTRAINT "guest_tasks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_pairings_device_code_hash_uidx" ON "agent_pairings" USING btree ("device_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_pairings_user_code_uidx" ON "agent_pairings" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "agent_pairings_status_expires_idx" ON "agent_pairings" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "agent_pairings_user_id_idx" ON "agent_pairings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_responses_task_idempotency_uidx" ON "guest_responses" USING btree ("guest_task_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "guest_responses_task_idx" ON "guest_responses" USING btree ("guest_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_tasks_public_id_uidx" ON "guest_tasks" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_tasks_token_hash_uidx" ON "guest_tasks" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "guest_tasks_organizer_idx" ON "guest_tasks" USING btree ("organizer_user_id");--> statement-breakpoint
CREATE INDEX "guest_tasks_status_expires_idx" ON "guest_tasks" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_api_key_id_api_keys_id_fk" FOREIGN KEY ("actor_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_actor_api_key_id_api_keys_id_fk" FOREIGN KEY ("actor_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_initiator_idempotency_uidx" ON "sessions" USING btree ("initiator_user_id","idempotency_key") WHERE "sessions"."idempotency_key" is not null;