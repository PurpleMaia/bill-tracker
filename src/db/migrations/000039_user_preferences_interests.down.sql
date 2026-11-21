ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS interest_topics,
  DROP COLUMN IF EXISTS interest_keywords,
  DROP COLUMN IF EXISTS onboarded_at;
