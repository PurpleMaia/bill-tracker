-- Drop the performance indexes added in the up migration (reverse order).

DROP INDEX IF EXISTS idx_bills_year;
DROP INDEX IF EXISTS idx_bills_bill_status;
DROP INDEX IF EXISTS idx_bills_dead;
DROP INDEX IF EXISTS idx_bills_archived;
DROP INDEX IF EXISTS idx_bills_food_related;
DROP INDEX IF EXISTS idx_status_updates_bill_id;
DROP INDEX IF EXISTS idx_members_tenant_user;
DROP INDEX IF EXISTS idx_user_bills_tenant_user;
DROP INDEX IF EXISTS idx_user_bills_bill_id;
DROP INDEX IF EXISTS idx_user_bills_user_id;
DROP INDEX IF EXISTS idx_user_account_status;
DROP INDEX IF EXISTS idx_user_email;
DROP INDEX IF EXISTS idx_sessions_session_token;
