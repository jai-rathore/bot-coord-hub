ALTER TABLE "agent_inbox" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
CREATE INDEX "agent_inbox_event_idx" ON "agent_inbox" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_inbox_dedupe_uidx" ON "agent_inbox" USING btree ("dedupe_key");--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
