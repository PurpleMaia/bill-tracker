CREATE TABLE user_preferences (
  user_id              UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  ai_opt_in            BOOLEAN NOT NULL DEFAULT false,
  kanban_detailed_view BOOLEAN NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
