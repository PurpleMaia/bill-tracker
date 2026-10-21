-- Rollback migration 000031
DROP INDEX IF EXISTS bills_browse_idx;
DROP INDEX IF EXISTS bills_number_trgm_idx;
DROP INDEX IF EXISTS bills_search_vector_idx;
ALTER TABLE bills DROP COLUMN IF EXISTS search_vector;
-- pg_trgm is intentionally NOT dropped: other objects may come to rely on it,
-- and dropping an extension is not safely reversible in a shared database.
