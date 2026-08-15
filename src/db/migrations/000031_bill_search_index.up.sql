-- Migration 000031: Full-text search index over bills for the /search page.
-- The generated column keeps itself correct on every scraper insert/update, so
-- there is no trigger and no sync job. Weights A/B/C make ts_rank score a bill
-- number hit above a title hit above a description hit.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE bills ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(bill_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(bill_title,  '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

-- Inverted index: a search becomes a lexeme-list intersection instead of a
-- 6k-row sequential scan (measured 157ms unindexed).
CREATE INDEX IF NOT EXISTS bills_search_vector_idx ON bills USING GIN (search_vector);

-- Trigram index for partial bill numbers ("hb2" -> HB20, HB21...), which FTS
-- cannot prefix-match inside a token.
CREATE INDEX IF NOT EXISTS bills_number_trgm_idx ON bills USING GIN (bill_number gin_trgm_ops);

-- Supports the default browse ordering when there is no search query.
CREATE INDEX IF NOT EXISTS bills_browse_idx ON bills (year, updated_at DESC);
