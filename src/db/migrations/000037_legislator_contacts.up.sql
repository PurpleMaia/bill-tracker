-- One row per legislator (or the Governor's office) a user reached out to about
-- a bill: the Contact Legislators tab's history. tenant_id records the org the
-- user acted for, so teammates see each other's outreach on shared bills.
CREATE TABLE IF NOT EXISTS legislator_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id       uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  -- What was asked: request a hearing, reach agreement in conference, ask the
  -- Governor to sign / reconsider, or urge a veto override.
  stage         text NOT NULL CHECK (stage IN ('hearing', 'conference', 'governor', 'intentToVeto', 'override')),
  recipient     text NOT NULL,
  method        text NOT NULL DEFAULT 'email' CHECK (method IN ('email', 'call', 'form', 'meeting', 'other')),
  note          text,
  contacted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legislator_contacts_user_bill ON legislator_contacts (user_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_legislator_contacts_tenant_bill ON legislator_contacts (tenant_id, bill_id);
