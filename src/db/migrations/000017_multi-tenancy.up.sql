-- ============================================================
-- Migration 000017: Multi-Tenancy
-- ============================================================

-- 1. Create enum types
CREATE TYPE sysrole AS ENUM ('sysadmin', 'user');
CREATE TYPE org_role AS ENUM ('admin', 'worker');

-- 2. Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    branding_config JSONB
);

-- 3. Add ai_status column to bills (raw AI/scraper classification)
--    bill_status becomes the derived public status
--    ai_status stores what the scraper/AI originally classified
ALTER TABLE bills
    ADD COLUMN ai_status bill_status;

UPDATE bills SET ai_status = bill_status;

-- 4. Add system_role to user table
ALTER TABLE "user"
    ADD COLUMN system_role sysrole NOT NULL DEFAULT 'user';

-- 5. Create members table (org membership)
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    org_role org_role NOT NULL DEFAULT 'worker',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_members_user_id ON members(user_id);
CREATE INDEX idx_members_tenant_id ON members(tenant_id);

-- 6. Add tenant_id to user_bills (nullable — NULL means public user adoption)
ALTER TABLE user_bills
    ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX idx_user_bills_tenant_id ON user_bills(tenant_id);

-- 7. Create org_bills table (org-level bill status)
CREATE TABLE IF NOT EXISTS org_bills (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    bill_status bill_status NOT NULL DEFAULT 'unassigned',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, bill_id)
);

CREATE INDEX idx_org_bills_tenant_id ON org_bills(tenant_id);
CREATE INDEX idx_org_bills_bill_id ON org_bills(bill_id);

-- 8. Add tenant_id to tags (org-scoped tags)
ALTER TABLE tags
    ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE tags
    DROP CONSTRAINT IF EXISTS tags_name_key;

ALTER TABLE tags
    ADD CONSTRAINT tags_name_tenant_unique UNIQUE (name, tenant_id);

CREATE INDEX idx_tags_tenant_id ON tags(tenant_id);

-- 9. Add tenant_id to pending_proposals (org-scoped proposals)
ALTER TABLE pending_proposals
    ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX idx_pending_proposals_tenant_id ON pending_proposals(tenant_id);

-- ============================================================
-- DATA MIGRATION: Seed Food+ org with existing data
-- ============================================================

-- 10. Create the Food+ tenant
INSERT INTO tenants (id, name, slug)
VALUES (gen_random_uuid(), 'Food+', 'food-plus');

-- 11. Add all existing users as members of Food+
INSERT INTO members (user_id, tenant_id, org_role)
SELECT
    u.id,
    t.id,
    CASE WHEN u.role = 'admin' THEN 'admin'::org_role ELSE 'worker'::org_role END
FROM "user" u
CROSS JOIN tenants t
WHERE t.slug = 'food-plus';

-- 12. Set tenant_id on all existing user_bills rows to Food+
UPDATE user_bills
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'food-plus');

-- 13. Create org_bills rows for every bill that any Food+ member has adopted
--     Copy the bill_status from the bills table
INSERT INTO org_bills (tenant_id, bill_id, bill_status)
SELECT DISTINCT
    t.id,
    ub.bill_id,
    COALESCE(b.bill_status, 'unassigned')
FROM user_bills ub
JOIN bills b ON b.id = ub.bill_id
CROSS JOIN tenants t
WHERE t.slug = 'food-plus'
  AND ub.bill_id IS NOT NULL;

-- 14. Set tenant_id on all existing tags to Food+
UPDATE tags
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'food-plus');

-- 15. Set tenant_id on all existing pending_proposals to Food+
UPDATE pending_proposals
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'food-plus');
