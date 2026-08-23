CREATE TYPE "public"."agent_operator_mode" AS ENUM('sage_primary', 'external_primary', 'sage_only');--> statement-breakpoint
CREATE TYPE "public"."sage_job_state" AS ENUM('pending', 'running', 'waiting_human', 'completed', 'failed', 'dead_letter', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sage_run_state" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sage_step_state" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_operator_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"mode" "agent_operator_mode" DEFAULT 'sage_primary' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sage_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"trigger" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text,
	"state" "sage_job_state" DEFAULT 'pending' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"worker_id" text,
	"leased_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"result" jsonb,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sage_jobs_attempts_check" CHECK ("sage_jobs"."attempts" >= 0),
	CONSTRAINT "sage_jobs_max_attempts_check" CHECK ("sage_jobs"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "sage_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"state" "sage_run_state" DEFAULT 'running' NOT NULL,
	"provider" text,
	"model" text,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sage_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"capability" text NOT NULL,
	"state" "sage_step_state" DEFAULT 'running' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_operator_preferences" ADD CONSTRAINT "agent_operator_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sage_jobs" ADD CONSTRAINT "sage_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sage_runs" ADD CONSTRAINT "sage_runs_job_id_sage_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."sage_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sage_steps" ADD CONSTRAINT "sage_steps_run_id_sage_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sage_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sage_jobs_claim_idx" ON "sage_jobs" USING btree ("state","run_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "sage_jobs_user_created_idx" ON "sage_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sage_jobs_idempotency_uidx" ON "sage_jobs" USING btree ("user_id","capability","idempotency_key") WHERE "sage_jobs"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sage_runs_job_attempt_uidx" ON "sage_runs" USING btree ("job_id","attempt");--> statement-breakpoint
CREATE INDEX "sage_runs_started_idx" ON "sage_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sage_steps_run_sequence_uidx" ON "sage_steps" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "sage_steps_capability_idx" ON "sage_steps" USING btree ("capability","started_at");