-- A user may write one testimony per hearing round of a bill (each committee
-- in each chamber, and conference), not one per bill.
ALTER TABLE testimonies DROP CONSTRAINT IF EXISTS testimonies_user_id_bill_id_key;

ALTER TABLE testimonies
  ADD COLUMN IF NOT EXISTS chamber text CHECK (chamber IN ('house', 'senate', 'conference')),
  ADD COLUMN IF NOT EXISTS committee text;

-- One testimony per (user, bill, round). Pre-existing rows have both columns
-- NULL; coalesce makes those collide too (works on any Postgres version,
-- unlike NULLS NOT DISTINCT).
CREATE UNIQUE INDEX IF NOT EXISTS testimonies_user_bill_round_key
  ON testimonies (user_id, bill_id, coalesce(chamber, ''), coalesce(committee, ''));

CREATE INDEX IF NOT EXISTS idx_testimonies_user_bill ON testimonies (user_id, bill_id);
