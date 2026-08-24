CREATE TABLE "llm_daily_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_key" text NOT NULL,
	"usage_day" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_daily_usage_tokens_check" CHECK ("llm_daily_usage"."input_tokens" >= 0 and "llm_daily_usage"."output_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "llm_provider_circuits" (
	"provider_key" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"opened_until" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_provider_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"usage_day" text NOT NULL,
	"input_tokens_reserved" integer NOT NULL,
	"output_tokens_reserved" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_provider_leases_tokens_check" CHECK ("llm_provider_leases"."input_tokens_reserved" >= 0 and "llm_provider_leases"."output_tokens_reserved" >= 0)
);
--> statement-breakpoint
ALTER TABLE "llm_daily_usage" ADD CONSTRAINT "llm_daily_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_provider_leases" ADD CONSTRAINT "llm_provider_leases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "llm_daily_usage_user_provider_day_uidx" ON "llm_daily_usage" USING btree ("user_id","provider_key","usage_day");--> statement-breakpoint
CREATE INDEX "llm_daily_usage_day_idx" ON "llm_daily_usage" USING btree ("usage_day");--> statement-breakpoint
CREATE INDEX "llm_provider_leases_provider_expiry_idx" ON "llm_provider_leases" USING btree ("provider_key","expires_at");--> statement-breakpoint
CREATE INDEX "llm_provider_leases_user_day_idx" ON "llm_provider_leases" USING btree ("user_id","usage_day");