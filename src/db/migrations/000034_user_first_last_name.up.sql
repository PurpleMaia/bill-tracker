-- Migration 000034: First and last name on the user.
--
-- Nullable on purpose: every account created before this migration has neither,
-- and Google accounts may omit given_name/family_name. The UI treats a user
-- missing either as an incomplete profile and prompts them to fill it in.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_name text;
