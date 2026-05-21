-- ============================================================
-- Rollback Migration 000017: Multi-Tenancy
-- ============================================================

-- Reverse order of up migration

-- Remove tenant_id from pending_proposals
ALTER TABLE pending_proposals
    DROP COLUMN IF EXISTS tenant_id;

-- Remove tenant_id from tags, restore global unique constraint
ALTER TABLE tags
    DROP CONSTRAINT IF EXISTS tags_name_tenant_unique;

ALTER TABLE tags
    DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);

-- Drop org_bills table
DROP TABLE IF EXISTS org_bills;

-- Remove tenant_id from user_bills
DROP INDEX IF EXISTS idx_user_bills_tenant_id;
ALTER TABLE user_bills
    DROP COLUMN IF EXISTS tenant_id;

-- Drop members table
DROP TABLE IF EXISTS members;

-- Remove system_role from user table
ALTER TABLE "user"
    DROP COLUMN IF EXISTS system_role;

-- Remove ai_status from bills
ALTER TABLE bills
    DROP COLUMN IF EXISTS ai_status;

-- Drop tenants table
DROP TABLE IF EXISTS tenants;

-- Drop enum types
DROP TYPE IF EXISTS org_role;
DROP TYPE IF EXISTS sysrole;
