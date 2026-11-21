-- NULL onboarded_at means "show the interest picker".
-- IF NOT EXISTS: some local DBs got these columns before this was renumbered
-- from 000038 (which became usage_events), so re-running must be harmless.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS interest_topics text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interest_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
