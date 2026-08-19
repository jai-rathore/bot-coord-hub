ALTER TABLE "users" ADD COLUMN "phone_e164" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_e164_uidx" ON "users" USING btree ("phone_e164");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_notify_channel_check" CHECK ("users"."notify_channel" in ('email', 'sms', 'both'));