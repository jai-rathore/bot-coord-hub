ALTER TYPE "public"."guest_task_type" ADD VALUE 'hiring_compatibility';--> statement-breakpoint
ALTER TABLE "guest_responses" ADD COLUMN "private_response" text;--> statement-breakpoint
ALTER TABLE "guest_tasks" ADD COLUMN "private_config" jsonb DEFAULT '{}'::jsonb NOT NULL;