-- Migration 000035: Legislator links for bills.
--
-- bill_introducers: the legislators who introduced a bill, in the order the
-- bill lists them. position is 0-based (0 = primary introducer). Rows cascade with the
-- bill; the legislator FK is left as the default (no cascade), matching
-- committee_chairs, so a legislator with introduced bills cannot be deleted
-- silently.
CREATE TABLE IF NOT EXISTS bill_introducers (
    bill_id       uuid    NOT NULL REFERENCES bills (id) ON DELETE CASCADE,
    legislator_id uuid    NOT NULL REFERENCES legislators (id),
    position      integer NOT NULL,
    PRIMARY KEY (bill_id, legislator_id)
);

-- "which bills did this legislator introduce" is the reverse lookup.
CREATE INDEX IF NOT EXISTS bill_introducers_legislator_id_idx
    ON bill_introducers (legislator_id);

-- bills.current_committee: the committee(s) a live-session bill is currently
-- waiting in, as a list of committee acronyms. NULL for bills outside the live
-- sessions (see LIVE_SESSION_YEARS) and for bills not yet resolved to a committee.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS current_committee text[];

-- Supports containment queries such as current_committee @> ARRAY['HHS'].
CREATE INDEX IF NOT EXISTS bills_current_committee_gin_idx
    ON bills USING GIN (current_committee);
