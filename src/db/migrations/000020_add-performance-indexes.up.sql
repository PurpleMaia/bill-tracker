-- Add indexes for common query paths observed in the data access layer.
-- All indexes use IF NOT EXISTS to be safe to re-run.

-- Sessions: looked up by token on every authenticated request (src/lib/auth.ts).
CREATE INDEX IF NOT EXISTS idx_sessions_session_token ON sessions(session_token);

-- Users: login + invite email matching, and admin status filtering.
CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
CREATE INDEX IF NOT EXISTS idx_user_account_status ON "user"(account_status);

-- User-bills: "bills I track" lookups and bill joins. tenant_id is already indexed.
CREATE INDEX IF NOT EXISTS idx_user_bills_user_id ON user_bills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bills_bill_id ON user_bills(bill_id);
CREATE INDEX IF NOT EXISTS idx_user_bills_tenant_user ON user_bills(tenant_id, user_id);

-- Members: validateMembership composite lookup (org-scoped membership check).
CREATE INDEX IF NOT EXISTS idx_members_tenant_user ON members(tenant_id, user_id);

-- Status updates: batched WHERE bill_id IN (...) and per-bill fetches; FK was unindexed.
CREATE INDEX IF NOT EXISTS idx_status_updates_bill_id ON status_updates(bill_id);

-- Bills: partial indexes targeting the exact boolean predicates used in queries.
CREATE INDEX IF NOT EXISTS idx_bills_food_related ON bills(food_related) WHERE food_related = true;
CREATE INDEX IF NOT EXISTS idx_bills_archived ON bills(archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_bills_dead ON bills(dead) WHERE dead = true;

-- Bills: status grouping (kanban columns) and session-year scoping.
CREATE INDEX IF NOT EXISTS idx_bills_bill_status ON bills(bill_status);
CREATE INDEX IF NOT EXISTS idx_bills_year ON bills(year);
