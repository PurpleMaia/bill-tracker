-- Rollback migration 000032
DROP INDEX IF EXISTS user_bills_user_bill_personal_uniq;
DROP INDEX IF EXISTS user_bills_user_bill_tenant_uniq;
-- The duplicate rows deleted in the up migration are not restored: they were
-- redundant tracking rows and there is no source to recover them from.
