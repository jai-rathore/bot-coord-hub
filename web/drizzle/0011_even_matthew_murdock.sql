ALTER TABLE "discovery_interests" ADD COLUMN "pair_key" text;--> statement-breakpoint
UPDATE "discovery_interests"
SET "pair_key" = LEAST("requester_user_id"::text, "recipient_user_id"::text)
  || ':' ||
  GREATEST("requester_user_id"::text, "recipient_user_id"::text);--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_interests_canonical_pair_uidx" ON "discovery_interests" USING btree ("intent_slug","pair_key") WHERE "discovery_interests"."pair_key" is not null;