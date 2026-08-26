-- Migration 000032: One tracking row per (user, bill, tenant).
--
-- trackBillById guarded duplicates with a non-atomic SELECT-then-INSERT, and
-- user_bills had no unique constraint behind it, so two concurrent track
-- requests for the same (user, bill) could both insert. This enforces the
-- intended uniqueness in the database so the insert can be conflict-safe.
--
-- tenant_id is nullable (NULL = a public/personal adoption). A plain
-- UNIQUE(user_id, bill_id, tenant_id) would NOT dedupe the NULL-tenant rows,
-- because NULL <> NULL in a unique index — so we use two partial indexes:
-- one for org adoptions and one for personal (NULL-tenant) adoptions.

-- Collapse any pre-existing duplicates first, or the index build fails. Keep the
-- lowest id in each group; children of user_bills key on nothing, so dropping
-- the extra rows loses no referenced data.
DELETE FROM user_bills a
USING user_bills b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.bill_id = b.bill_id
  AND a.tenant_id IS NOT DISTINCT FROM b.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS user_bills_user_bill_tenant_uniq
  ON user_bills (user_id, bill_id, tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_bills_user_bill_personal_uniq
  ON user_bills (user_id, bill_id)
  WHERE tenant_id IS NULL;
