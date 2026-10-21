-- Migration 000033: Trigram indexes for the substring-fallback branch of the
-- bill search. searchBills now matches word queries with `bill_title ILIKE
-- '%token%' OR description ILIKE '%token%'` alongside FTS, because the english
-- stemmer is inconsistent across word families ("Environmental" -> lexeme
-- `environment`, but query "environment" -> `environ`, no match). A leading
-- wildcard ILIKE can't use a b-tree, so these GIN trigram indexes let selective
-- tokens ("aquaculture", "environment") use a bitmap index scan instead of a full
-- scan -- mirroring bills_number_trgm_idx from 000031. Common or short (<3 trigram
-- char) tokens still seq-scan, which the planner picks deliberately and which
-- measures ~18ms on the current ~6k-row table. pg_trgm is installed by 000031.
CREATE INDEX IF NOT EXISTS bills_title_trgm_idx ON bills USING GIN (bill_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS bills_description_trgm_idx ON bills USING GIN (description gin_trgm_ops);
