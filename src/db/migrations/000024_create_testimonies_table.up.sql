CREATE TABLE testimonies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id       uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  author_name   text NOT NULL DEFAULT '',
  organization  text NOT NULL DEFAULT '',
  position      text NOT NULL DEFAULT 'comments' CHECK (position IN ('support', 'oppose', 'comments')),
  content_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, bill_id)
);

CREATE INDEX idx_testimonies_bill_id ON testimonies(bill_id);
