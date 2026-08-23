CREATE TABLE "sage_discovery_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"client_message_id" text,
	"body_encrypted" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sage_discovery_messages_role_check" CHECK ("sage_discovery_messages"."role" in ('human', 'sage'))
);
--> statement-breakpoint
CREATE TABLE "sage_discovery_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"intent_slug" text NOT NULL,
	"state" text DEFAULT 'collecting' NOT NULL,
	"draft_encrypted" text NOT NULL,
	"pending_locations_encrypted" text,
	"latest_job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sage_discovery_threads_state_check" CHECK ("sage_discovery_threads"."state" in ('collecting', 'ready_for_review', 'submitted', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "sage_discovery_messages" ADD CONSTRAINT "sage_discovery_messages_thread_id_sage_discovery_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."sage_discovery_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sage_discovery_threads" ADD CONSTRAINT "sage_discovery_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sage_discovery_threads" ADD CONSTRAINT "sage_discovery_threads_latest_job_id_sage_jobs_id_fk" FOREIGN KEY ("latest_job_id") REFERENCES "public"."sage_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sage_discovery_messages_thread_created_idx" ON "sage_discovery_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sage_discovery_messages_client_uidx" ON "sage_discovery_messages" USING btree ("thread_id","client_message_id") WHERE "sage_discovery_messages"."client_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sage_discovery_threads_user_intent_uidx" ON "sage_discovery_threads" USING btree ("user_id","intent_slug");--> statement-breakpoint
CREATE INDEX "sage_discovery_threads_updated_idx" ON "sage_discovery_threads" USING btree ("updated_at");