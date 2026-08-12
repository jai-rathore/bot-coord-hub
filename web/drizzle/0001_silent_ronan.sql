CREATE TYPE "public"."confirm_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
ALTER TABLE "links" ALTER COLUMN "to_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "confirms" ADD COLUMN "status" "confirm_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "confirms" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "pair_link_id" uuid;--> statement-breakpoint
CREATE INDEX "confirms_status_idx" ON "confirms" USING btree ("status");