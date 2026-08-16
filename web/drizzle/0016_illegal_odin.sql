CREATE TABLE "agent_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"headline" text,
	"website_url" text,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_profiles_handle_format_check" CHECK ("agent_profiles"."handle" = lower("agent_profiles"."handle") and "agent_profiles"."handle" ~ '^[a-z][a-z0-9-]{2,29}$')
);
--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "profile_handle" text;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_profiles_user_id_uidx" ON "agent_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_profiles_handle_uidx" ON "agent_profiles" USING btree (lower("handle"));--> statement-breakpoint
CREATE INDEX "links_profile_handle_idx" ON "links" USING btree ("profile_handle");--> statement-breakpoint
CREATE UNIQUE INDEX "links_profile_handle_user_uidx" ON "links" USING btree ("profile_handle","to_user_id");--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_single_public_source_check" CHECK (not ("links"."public_invite_id" is not null and "links"."profile_handle" is not null));--> statement-breakpoint
INSERT INTO "agent_profiles" (
	"user_id",
	"handle",
	"display_name",
	"headline",
	"website_url",
	"is_published"
)
SELECT
	"id",
	'jai',
	COALESCE(NULLIF(BTRIM("name"), ''), 'Jai Rathore'),
	'Coordinate with Jai through his Grok Bot.',
	'https://jairathore.com',
	true
FROM "users"
WHERE LOWER("email") = 'jaiadityarathore@gmail.com'
ON CONFLICT DO NOTHING;