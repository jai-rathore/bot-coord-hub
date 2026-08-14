ALTER TABLE "agent_inbox" ADD COLUMN "discovery_interest_id" uuid;--> statement-breakpoint
UPDATE "agent_inbox" AS ai
SET "discovery_interest_id" = di."id"
FROM "discovery_interests" AS di
WHERE ai."body"->>'interestId' = di."id"::text;--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_discovery_interest_id_discovery_interests_id_fk" FOREIGN KEY ("discovery_interest_id") REFERENCES "public"."discovery_interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_inbox_discovery_interest_idx" ON "agent_inbox" USING btree ("discovery_interest_id");