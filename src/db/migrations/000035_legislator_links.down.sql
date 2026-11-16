DROP INDEX IF EXISTS bills_current_committee_gin_idx;
ALTER TABLE bills DROP COLUMN IF EXISTS current_committee;
DROP INDEX IF EXISTS bill_introducers_legislator_id_idx;
DROP TABLE IF EXISTS bill_introducers;
