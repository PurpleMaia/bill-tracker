-- Backfill any tags that still have NULL tenant_id with Food+ tenant
UPDATE tags
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'food-plus')
WHERE tenant_id IS NULL;

-- Enforce NOT NULL on tenant_id
ALTER TABLE tags
    ALTER COLUMN tenant_id SET NOT NULL;
