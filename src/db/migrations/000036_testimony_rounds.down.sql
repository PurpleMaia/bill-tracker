-- Collapse back to one testimony per (user, bill), keeping the most recently edited.
DELETE FROM testimonies t
USING testimonies newer
WHERE t.user_id = newer.user_id
  AND t.bill_id = newer.bill_id
  AND (newer.updated_at, newer.id) > (t.updated_at, t.id);

DROP INDEX IF EXISTS idx_testimonies_user_bill;
DROP INDEX IF EXISTS testimonies_user_bill_round_key;

ALTER TABLE testimonies
  DROP COLUMN IF EXISTS committee,
  DROP COLUMN IF EXISTS chamber;

ALTER TABLE testimonies ADD CONSTRAINT testimonies_user_id_bill_id_key UNIQUE (user_id, bill_id);
