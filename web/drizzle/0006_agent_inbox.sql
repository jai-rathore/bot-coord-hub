ALTER TABLE "api_keys" ADD COLUMN "callback_url" text;--> statement-breakpoint
CREATE TABLE "agent_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_inbox_user_created_idx" ON "agent_inbox" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_inbox_user_unacked_idx" ON "agent_inbox" USING btree ("user_id","acked_at");--> statement-breakpoint
CREATE INDEX "agent_inbox_session_kind_idx" ON "agent_inbox" USING btree ("session_id","kind");
