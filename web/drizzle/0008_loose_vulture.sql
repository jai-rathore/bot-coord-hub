CREATE TYPE "public"."public_invite_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "public_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"label" text,
	"status" "public_invite_status" DEFAULT 'active' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirm_required" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_redemptions" integer DEFAULT 25 NOT NULL,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "public_invite_id" uuid;--> statement-breakpoint
ALTER TABLE "public_invites" ADD CONSTRAINT "public_invites_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "public_invites_owner_created_idx" ON "public_invites" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "public_invites_status_expires_idx" ON "public_invites" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_public_invite_id_public_invites_id_fk" FOREIGN KEY ("public_invite_id") REFERENCES "public"."public_invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "links_public_invite_id_idx" ON "links" USING btree ("public_invite_id");--> statement-breakpoint
CREATE UNIQUE INDEX "links_public_invite_user_uidx" ON "links" USING btree ("public_invite_id","to_user_id");