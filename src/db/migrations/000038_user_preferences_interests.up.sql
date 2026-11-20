-- NULL onboarded_at means "show the interest picker".
ALTER TABLE user_preferences
  ADD COLUMN interest_topics text[] NOT NULL DEFAULT '{}',
  ADD COLUMN interest_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN onboarded_at timestamptz;
