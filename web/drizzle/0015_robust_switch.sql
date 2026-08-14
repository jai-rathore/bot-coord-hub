CREATE TABLE "discovery_pair_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pair_key" text NOT NULL,
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"intent_slug" text NOT NULL,
	"outcome" text NOT NULL,
	"probe_count" integer DEFAULT 1 NOT NULL,
	"last_outcome_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_pair_history_not_self_check" CHECK ("discovery_pair_history"."user_a_id" <> "discovery_pair_history"."user_b_id")
);
--> statement-breakpoint
ALTER TABLE "discovery_handles" ADD COLUMN "requester_api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "discovery_pair_history" ADD CONSTRAINT "discovery_pair_history_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_pair_history" ADD CONSTRAINT "discovery_pair_history_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_pair_history_intent_pair_uidx" ON "discovery_pair_history" USING btree ("intent_slug","pair_key");--> statement-breakpoint
CREATE INDEX "discovery_pair_history_user_a_idx" ON "discovery_pair_history" USING btree ("user_a_id","intent_slug");--> statement-breakpoint
CREATE INDEX "discovery_pair_history_user_b_idx" ON "discovery_pair_history" USING btree ("user_b_id","intent_slug");--> statement-breakpoint
ALTER TABLE "discovery_handles" ADD CONSTRAINT "discovery_handles_requester_api_key_id_api_keys_id_fk" FOREIGN KEY ("requester_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;