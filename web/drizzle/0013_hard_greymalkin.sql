DROP INDEX "user_locations_coarse_idx";--> statement-breakpoint
ALTER TABLE "discovery_interests" ADD COLUMN "requester_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discovery_interests" ADD COLUMN "requester_confirmed_by_api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "user_locations" ADD COLUMN "private_value_encrypted" text;--> statement-breakpoint
UPDATE "purpose_enrollments" SET "location_id" = NULL
WHERE "location_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "user_locations";--> statement-breakpoint
ALTER TABLE "discovery_interests" ADD CONSTRAINT "discovery_interests_requester_confirmed_by_api_key_id_api_keys_id_fk" FOREIGN KEY ("requester_confirmed_by_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "safety_reports_reporter_interest_uidx" ON "safety_reports" USING btree ("reporter_user_id","interest_id") WHERE "safety_reports"."interest_id" is not null;