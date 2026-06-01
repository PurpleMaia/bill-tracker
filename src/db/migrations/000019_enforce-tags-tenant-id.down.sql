-- Revert NOT NULL constraint
ALTER TABLE tags
    ALTER COLUMN tenant_id DROP NOT NULL;
