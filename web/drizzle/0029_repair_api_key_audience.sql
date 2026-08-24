-- Repair production drift caused by migration 0026 having an earlier journal
-- timestamp than hand-written migration 0025. Drizzle correctly treated 0026
-- as older and skipped it after 0025 had already been recorded.
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "audience" text;
