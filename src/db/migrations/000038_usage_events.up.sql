-- One row per tracked product-usage event (login, signup, status_change,
-- page views, feature actions). Aggregates only: the analytics dashboard never
-- shows per-person activity. user_id / tenant_id are nulled if the row they
-- point at is deleted; anon_id identifies a signed-out browser. No IPs or
-- user agents are stored.
CREATE TABLE IF NOT EXISTS usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event       text NOT NULL,
  user_id     uuid REFERENCES "user"(id) ON DELETE SET NULL,
  tenant_id   uuid REFERENCES tenants(id) ON DELETE SET NULL,
  anon_id     text,
  path        text,
  props       jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_event_created ON usage_events (event, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON usage_events (created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_created ON usage_events (tenant_id, created_at);
