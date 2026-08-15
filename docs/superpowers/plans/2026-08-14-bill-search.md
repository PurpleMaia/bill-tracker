# Bill Search Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/search` page that searches all 6,126 bills by number, RELATING-TO title, and description, with left-rail filters, infinite scroll, and one-click tracking gated behind login.

**Architecture:** A Postgres `tsvector` generated column with a GIN index does the matching server-side; a keyset-paginated `searchBills()` query feeds both a REST route and a server action through the project's switchable data-client; React Query's `useInfiniteQuery` caches every page so re-queries and back-navigation cost no network.

**Tech Stack:** Next.js 15 App Router, TypeScript, Kysely, PostgreSQL 17 (FTS + pg_trgm), TanStack React Query, shadcn/ui, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-bill-search-design.md`

## Global Constraints

- **Kysely only** — no raw SQL strings for queries. Use `sql` template helper for FTS expressions, which stays parameterized.
- **All queries live in `src/db/queries/*`** — routes and actions are thin transports. No inline `db.*` in a route or action.
- **`src/lib/` is DB-free** — pure utilities only.
- **No barrel `index.ts`** — import by deep path (`@/lib/bills/search-params`).
- **Auth via `@/lib/auth/auth-guards`** — never hand-roll the cookie→session→membership preamble. (The existing `src/app/api/bills/route.ts` predates this rule; do not copy its inline preamble.)
- **A `'use server'` file may only export async functions** — no type exports, no re-exports. Shared types go in plain modules.
- **Client components call `data.*`** from `@/lib/data-client`, never raw `fetch`.
- **Tests are pure unit tests** in `src/lib/__tests__/` — no DB, no mocking.
- **Commit prefixes:** `feat:`, `fix:`, `refactor:`, `docs:`. **No `Co-Authored-By` lines.**
- **Card state via icon medallions/chips — never left-edge accent strips.**
- Run `npm test`, `npm run typecheck`, and `npm run build` before declaring done. The build catches `'use server'` export violations typecheck misses.

## File Structure

**Create**
| File | Responsibility |
|---|---|
| `src/db/migrations/000031_bill_search_index.up.sql` | tsvector column + GIN/trgm/browse indexes |
| `src/db/migrations/000031_bill_search_index.down.sql` | Rollback |
| `src/lib/bills/search-params.ts` | Pure: filter normalization, bill-number detection, chamber derivation, cursor codec |
| `src/lib/__tests__/search-params.test.ts` | Unit tests for the above |
| `src/app/api/bills/search/route.ts` | GET search (optionalSession) |
| `src/app/api/bills/track/route.ts` | POST track-by-id (requireSession) |
| `src/hooks/use-bill-search.ts` | `useInfiniteQuery` wrapper + debounce |
| `src/components/search/bill-search-view.tsx` | Page shell: layout, state, wiring |
| `src/components/search/bill-search-card.tsx` | One result card |
| `src/components/search/search-filter-rail.tsx` | Filter controls (shared by desktop rail + mobile sheet) |
| `src/components/search/search-filters-sheet.tsx` | Mobile Sheet wrapper |
| `src/components/search/track-button.tsx` | Track button + login guard |

**Modify**
| File | Change |
|---|---|
| `src/types/legislation.ts` | `+BillSearchResult`, `+BillSearchResponse` |
| `src/db/queries/bills-read.ts` | `+searchBills()` |
| `src/db/queries/bills-write.ts` | `+trackBillById()` |
| `src/app/actions/bills.ts` | `+searchBillsAction`, `+trackBillByIdAction` |
| `src/lib/data-client/bills.client.ts` | `+searchBillsFetch`, `+trackBillByIdFetch` + registration |
| `src/app/(main)/search/page.tsx` | Replace placeholder |

---

### Task 1: Pure search-params module

Pure logic first — it has no dependencies, and every later task consumes its types.

**Files:**
- Create: `src/lib/bills/search-params.ts`
- Test: `src/lib/__tests__/search-params.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SearchFilters`, `DeadFilter`, `Chamber`, `normalizeFilters()`, `isBillNumberQuery()`, `chamberPrefixes()`, `encodeCursor()`, `decodeCursor()`, `SearchCursor`, `DEFAULT_FILTERS`, `filtersToQueryString()`, `activeFilterCount()`, `SEARCH_PAGE_SIZE`, `parseSearchParams()`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/search-params.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeFilters,
  isBillNumberQuery,
  chamberPrefixes,
  encodeCursor,
  decodeCursor,
  activeFilterCount,
  DEFAULT_FILTERS,
  type SearchFilters,
} from '@/lib/bills/search-params';

describe('isBillNumberQuery', () => {
  it('detects bill numbers in common shapes', () => {
    expect(isBillNumberQuery('hb20')).toBe(true);
    expect(isBillNumberQuery('HB 20')).toBe(true);
    expect(isBillNumberQuery('sb-1251')).toBe(true);
    expect(isBillNumberQuery('  SB1251  ')).toBe(true);
    expect(isBillNumberQuery('hcr5')).toBe(true);
    expect(isBillNumberQuery('hb2')).toBe(true);
  });

  it('rejects ordinary word queries', () => {
    expect(isBillNumberQuery('housing')).toBe(false);
    expect(isBillNumberQuery('agriculture')).toBe(false);
    expect(isBillNumberQuery('')).toBe(false);
    // "sb" alone has no digits, so it is a word query, not a number lookup
    expect(isBillNumberQuery('sb')).toBe(false);
  });
});

describe('chamberPrefixes', () => {
  it('maps chambers to bill_number prefixes', () => {
    expect(chamberPrefixes(['house'])).toEqual(['H']);
    expect(chamberPrefixes(['senate'])).toEqual(['S']);
    expect(chamberPrefixes(['house', 'senate']).sort()).toEqual(['H', 'S']);
    expect(chamberPrefixes([])).toEqual([]);
  });
});

describe('normalizeFilters', () => {
  it('produces a stable key regardless of array order', () => {
    const a = normalizeFilters({ ...DEFAULT_FILTERS, years: [2025, 2026] });
    const b = normalizeFilters({ ...DEFAULT_FILTERS, years: [2026, 2025] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('trims and lowercases the query', () => {
    expect(normalizeFilters({ ...DEFAULT_FILTERS, q: '  Agriculture  ' }).q).toBe('agriculture');
  });

  it('sorts chambers and stages', () => {
    const n = normalizeFilters({
      ...DEFAULT_FILTERS,
      chambers: ['senate', 'house'],
      stages: ['simpleScheduled', 'simpleWaiting'],
    });
    expect(n.chambers).toEqual(['house', 'senate']);
    expect(n.stages).toEqual(['simpleScheduled', 'simpleWaiting']);
  });

  it('defaults to the 2026 session', () => {
    expect(DEFAULT_FILTERS.years).toEqual([2026]);
    expect(DEFAULT_FILTERS.deadFilter).toBe('all');
  });
});

describe('cursor codec', () => {
  it('round-trips a cursor', () => {
    const cursor = { rank: 0.30879, updatedAt: '2026-06-29T20:25:47.016Z', id: 'abc-123' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('returns null for malformed input', () => {
    expect(decodeCursor('not-base64!!')).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });
});

describe('activeFilterCount', () => {
  it('does not count defaults', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  it('counts each non-default group once', () => {
    const filters: SearchFilters = {
      ...DEFAULT_FILTERS,
      years: [2025, 2026],
      chambers: ['house'],
      deadFilter: 'alive',
    };
    expect(activeFilterCount(filters)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/search-params.test.ts`
Expected: FAIL — cannot resolve `@/lib/bills/search-params`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/bills/search-params.ts`:

```ts
/**
 * Pure filter/param logic for the bill search page. No DB access — safe for
 * src/lib per project convention. Shared by the API route, the server action,
 * and the client hook so the three can never disagree about what a filter set
 * means or how a cursor is encoded.
 */

export type DeadFilter = 'all' | 'alive' | 'dead';
export type Chamber = 'house' | 'senate';

export interface SearchFilters {
  q: string;
  years: number[];
  chambers: Chamber[];
  stages: string[];
  deadFilter: DeadFilter;
}

/**
 * 2026 is the live session. Defaulting here (rather than to all 6,126 bills)
 * keeps the first screen relevant; 93% of the corpus is dead and all of 2025
 * is archived.
 */
export const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  years: [2026],
  chambers: [],
  stages: [],
  deadFilter: 'all',
};

export const SEARCH_PAGE_SIZE = 40;

/**
 * True when the query looks like a bill number (HB20, SB 1251, HCR-5).
 * Requires at least one digit, so a bare "sb" stays a word query.
 */
export function isBillNumberQuery(q: string): boolean {
  return /^[hs][bcr]?\s*-?\s*\d+/i.test(q.trim());
}

/** House bills start with H, Senate with S — derived, not stored. */
export function chamberPrefixes(chambers: Chamber[]): string[] {
  return chambers.map((c) => (c === 'house' ? 'H' : 'S'));
}

/**
 * Canonical form of a filter set. Sorting arrays and trimming the query is what
 * makes the React Query cache key stable — without it [2025,2026] and
 * [2026,2025] would be cache misses of each other.
 */
export function normalizeFilters(filters: SearchFilters): SearchFilters {
  return {
    q: filters.q.trim().toLowerCase(),
    years: [...filters.years].sort((a, b) => a - b),
    chambers: [...filters.chambers].sort(),
    stages: [...filters.stages].sort(),
    deadFilter: filters.deadFilter,
  };
}

/** Number of filter groups differing from the default — drives the mobile badge. */
export function activeFilterCount(filters: SearchFilters): number {
  let count = 0;
  const years = [...filters.years].sort((a, b) => a - b);
  const defaultYears = [...DEFAULT_FILTERS.years].sort((a, b) => a - b);
  if (JSON.stringify(years) !== JSON.stringify(defaultYears)) count++;
  if (filters.chambers.length > 0) count++;
  if (filters.stages.length > 0) count++;
  if (filters.deadFilter !== DEFAULT_FILTERS.deadFilter) count++;
  return count;
}

export interface SearchCursor {
  rank: number;
  updatedAt: string;
  id: string;
}

/** Keyset cursor. Base64 keeps it opaque and URL-safe. */
export function encodeCursor(cursor: SearchCursor): string {
  const json = JSON.stringify([cursor.rank, cursor.updatedAt, cursor.id]);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): SearchCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [rank, updatedAt, id] = parsed;
    if (typeof rank !== 'number' || typeof updatedAt !== 'string' || typeof id !== 'string') {
      return null;
    }
    return { rank, updatedAt, id };
  } catch {
    return null;
  }
}

/** Serializes filters for the fetch arm's query string. */
export function filtersToQueryString(
  filters: SearchFilters,
  cursor?: string | null,
): string {
  const n = normalizeFilters(filters);
  const qs = new URLSearchParams();
  if (n.q) qs.set('q', n.q);
  if (n.years.length) qs.set('years', n.years.join(','));
  if (n.chambers.length) qs.set('chambers', n.chambers.join(','));
  if (n.stages.length) qs.set('stages', n.stages.join(','));
  if (n.deadFilter !== 'all') qs.set('dead', n.deadFilter);
  if (cursor) qs.set('cursor', cursor);
  return qs.toString();
}

/** Parses a query string back into filters. Unknown values fall back to defaults. */
export function parseSearchParams(params: URLSearchParams): SearchFilters {
  const years = (params.get('years') ?? '')
    .split(',')
    .map((y) => parseInt(y, 10))
    .filter((y) => Number.isFinite(y));
  const chambers = (params.get('chambers') ?? '')
    .split(',')
    .filter((c): c is Chamber => c === 'house' || c === 'senate');
  const stages = (params.get('stages') ?? '').split(',').filter(Boolean);
  const dead = params.get('dead');

  return {
    q: params.get('q') ?? '',
    years: years.length ? years : [],
    chambers,
    stages,
    deadFilter: dead === 'alive' || dead === 'dead' ? dead : 'all',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/search-params.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bills/search-params.ts src/lib/__tests__/search-params.test.ts
git commit -m "feat: add pure search param logic for bill search"
```

---

### Task 2: Search index migration

**Files:**
- Create: `src/db/migrations/000031_bill_search_index.up.sql`
- Create: `src/db/migrations/000031_bill_search_index.down.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `bills.search_vector` column; indexes `bills_search_vector_idx`, `bills_number_trgm_idx`, `bills_browse_idx`.

- [ ] **Step 1: Write the up migration**

Create `src/db/migrations/000031_bill_search_index.up.sql`:

```sql
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
```

- [ ] **Step 2: Write the down migration**

Create `src/db/migrations/000031_bill_search_index.down.sql`:

```sql
-- Rollback migration 000031
DROP INDEX IF EXISTS bills_browse_idx;
DROP INDEX IF EXISTS bills_number_trgm_idx;
DROP INDEX IF EXISTS bills_search_vector_idx;
ALTER TABLE bills DROP COLUMN IF EXISTS search_vector;
-- pg_trgm is intentionally NOT dropped: other objects may come to rely on it,
-- and dropping an extension is not safely reversible in a shared database.
```

- [ ] **Step 3: Run the migration**

Run: `npm run migrate:up`
Expected: migration 000031 applies with no error.

- [ ] **Step 4: Verify the column and indexes exist**

Run:
```bash
psql "$DATABASE_URL" -c "\d bills" | grep -E "search_vector|bills_(search|number|browse)"
```
Expected: the `search_vector` column plus all three indexes are listed.

If `CREATE EXTENSION pg_trgm` is refused by a managed host, stop and report it —
the spec's fallback is `bill_number ILIKE 'hb2%'` in place of the trigram branch.

- [ ] **Step 5: Verify rollback works, then re-apply**

Run:
```bash
npm run migrate:down && npm run migrate:up
```
Expected: both succeed. This proves the down migration before it is ever needed.

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations/000031_bill_search_index.up.sql src/db/migrations/000031_bill_search_index.down.sql
git commit -m "feat: add full-text search index to bills"
```

---

### Task 3: `searchBills()` query

**Files:**
- Modify: `src/types/legislation.ts` (append types)
- Modify: `src/db/queries/bills-read.ts` (append function)

**Interfaces:**
- Consumes: `SearchFilters`, `isBillNumberQuery`, `chamberPrefixes`, `encodeCursor`, `decodeCursor`, `SEARCH_PAGE_SIZE` from Task 1.
- Produces: `searchBills(params: SearchBillsParams): Promise<BillSearchResponse>`; types `BillSearchResult`, `BillSearchResponse`, `SearchBillsParams`.

- [ ] **Step 1: Add the result types**

Append to `src/types/legislation.ts`:

```ts
/**
 * Lean projection for the /search page. Deliberately excludes tags, status
 * updates, and versions: getAdditionalBillData() issues extra queries per bill
 * set and search cards display none of it.
 */
export interface BillSearchResult {
  id: string;
  bill_number: string;
  bill_title: string;
  description: string;
  year: number | null;
  bill_status: string | null;
  dead: boolean;
  bill_url: string;
  updated_at: string | null;
}

export interface BillSearchResponse {
  items: BillSearchResult[];
  nextCursor: string | null;
  totalCount: number;
}
```

- [ ] **Step 2: Add the query function**

Append to `src/db/queries/bills-read.ts` (the file already has `'use server'` at
the top and imports `sql` from kysely):

```ts
import {
  isBillNumberQuery,
  chamberPrefixes,
  encodeCursor,
  decodeCursor,
  SEARCH_PAGE_SIZE,
  type SearchFilters,
} from '@/lib/bills/search-params';
import { STATUS_TO_SIMPLIFIED } from '@/lib/bills/kanban-columns';
import type { BillSearchResult, BillSearchResponse } from '@/types/legislation';

export interface SearchBillsParams extends SearchFilters {
  cursor?: string | null;
  limit?: number;
}

/**
 * Searches the FULL bills table — the only bill query with no user_bills join,
 * so it can surface bills nobody tracks yet.
 *
 * Two branches: a bill-number lookup (exact, then trigram prefix) and an FTS
 * branch ranked by ts_rank over the weighted search_vector. Pagination is
 * keyset, not OFFSET, so deep pages stay flat.
 */
export async function searchBills(params: SearchBillsParams): Promise<BillSearchResponse> {
  const { q, years, chambers, stages, deadFilter, cursor, limit = SEARCH_PAGE_SIZE } = params;
  const trimmed = (q ?? '').trim();

  // Expand simplified stage ids back to the concrete BillStatus values stored
  // on the row. STATUS_TO_SIMPLIFIED is the same mapping the kanban board uses.
  const statusValues = stages?.length
    ? Object.entries(STATUS_TO_SIMPLIFIED)
        .filter(([, simplified]) => stages.includes(simplified))
        .map(([status]) => status)
    : [];

  const applyFilters = <T extends { where: any }>(qb: T): T => {
    let out: any = qb;
    if (years?.length) out = out.where('year', 'in', years);
    if (chambers?.length) {
      const prefixes = chamberPrefixes(chambers);
      out = out.where((eb: any) =>
        eb.or(prefixes.map((p) => eb('bill_number', 'like', `${p}%`))),
      );
    }
    if (statusValues.length) out = out.where('bill_status', 'in', statusValues);
    if (deadFilter === 'alive') out = out.where('dead', '=', false);
    if (deadFilter === 'dead') out = out.where('dead', '=', true);
    return out as T;
  };

  const rankExpr = trimmed
    ? isBillNumberQuery(trimmed)
      // Bill-number branch: exact match outranks prefix, prefix outranks
      // substring. Values are parameterized by the sql template.
      ? sql<number>`CASE
          WHEN upper(replace(replace(bill_number, ' ', ''), '-', '')) = upper(${trimmed.replace(/[\s-]/g, '')}) THEN 1.0
          WHEN upper(replace(replace(bill_number, ' ', ''), '-', '')) LIKE upper(${trimmed.replace(/[\s-]/g, '') + '%'}) THEN 0.8
          ELSE 0.6 END`
      : sql<number>`ts_rank(search_vector, websearch_to_tsquery('english', ${trimmed}))`
    : sql<number>`0`;

  let base = db.selectFrom('bills');

  if (trimmed) {
    base = isBillNumberQuery(trimmed)
      ? base.where(
          sql<boolean>`replace(replace(bill_number, ' ', ''), '-', '') ILIKE ${'%' + trimmed.replace(/[\s-]/g, '') + '%'}`,
        )
      : base.where(
          sql<boolean>`search_vector @@ websearch_to_tsquery('english', ${trimmed})`,
        );
  }

  base = applyFilters(base);

  // Count before pagination so the header can show the full result size.
  const countRow = await base
    .select(({ fn }) => fn.countAll<string>().as('count'))
    .executeTakeFirst();
  const totalCount = Number(countRow?.count ?? 0);

  let rowsQuery = base
    .select([
      'id',
      'bill_number',
      'bill_title',
      'description',
      'year',
      'bill_status',
      'dead',
      'bill_url',
      'updated_at',
    ])
    .select(rankExpr.as('rank'))
    .orderBy(sql`rank`, 'desc')
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit + 1); // one extra row tells us whether another page exists

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    // Keyset: continue strictly after the last row's (rank, updated_at, id).
    rowsQuery = rowsQuery.where(
      sql<boolean>`(${rankExpr}, updated_at, id) < (${decoded.rank}, ${decoded.updatedAt}::timestamptz, ${decoded.id}::uuid)`,
    );
  }

  const rows = await rowsQuery.execute();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: BillSearchResult[] = page.map((r: any) => ({
    id: r.id,
    bill_number: r.bill_number ?? '',
    bill_title: r.bill_title ?? '',
    description: r.description ?? '',
    year: r.year,
    bill_status: r.bill_status,
    dead: r.dead,
    bill_url: r.bill_url,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  }));

  const last: any = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          rank: Number(last.rank),
          updatedAt: new Date(last.updated_at).toISOString(),
          id: last.id,
        })
      : null;

  return { items, nextCursor, totalCount };
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Verify against real data**

Create `tmp-verify-search.mjs` in the project root:

```js
import 'dotenv/config';
import pg from 'pg';
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const c = new pg.Client({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
await c.connect();
const t0 = Date.now();
const r = await c.query(`
  select bill_number, year, left(bill_title, 50) t,
         ts_rank(search_vector, websearch_to_tsquery('english', 'agriculture')) rank
  from bills
  where search_vector @@ websearch_to_tsquery('english', 'agriculture')
  order by rank desc limit 5`);
console.log('indexed ms:', Date.now() - t0);
console.table(r.rows);
const plan = await c.query(`explain select 1 from bills where search_vector @@ websearch_to_tsquery('english','agriculture')`);
console.log(plan.rows.map(x => x['QUERY PLAN']).join('\n'));
await c.end();
```

Run: `node ./tmp-verify-search.mjs && rm -f ./tmp-verify-search.mjs`
Expected: title matches rank highest; timing well under the 157ms unindexed
baseline; the plan shows a **Bitmap Index Scan on `bills_search_vector_idx`**,
not a Seq Scan. If it shows Seq Scan, the planner is ignoring the index —
usually because the table is too small for the planner to bother; confirm with
`set enable_seqscan = off;` before treating it as a bug.

- [ ] **Step 5: Commit**

```bash
git add src/types/legislation.ts src/db/queries/bills-read.ts
git commit -m "feat: add searchBills query over the full bills table"
```

---

### Task 4: `trackBillById()` query

**Files:**
- Modify: `src/db/queries/bills-write.ts` (append after `trackBill`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `trackBillById(userId: string, billId: string, tenantId?: string): Promise<{ tracked: boolean }>`.

- [ ] **Step 1: Add the function**

Append to `src/db/queries/bills-write.ts`:

```ts
/**
 * Tracks an EXISTING bill by id. The URL-based trackBill() looks a bill up by
 * URL and scrapes capitol.hawaii.gov when it is missing; from search results the
 * bill provably exists and we hold its id, so both of those steps are dead
 * weight. Keeps the parts that matter: the duplicate guard, the user_bills
 * insert, and org_bills seeding on the org's first adoption.
 *
 * Idempotent: tracking an already-tracked bill resolves { tracked: false }
 * rather than throwing, because a double-click should not surface an error.
 */
export async function trackBillById(
  userId: string,
  billId: string,
  tenantId?: string,
): Promise<{ tracked: boolean }> {
  const bill = await db
    .selectFrom('bills')
    .select(['id', 'bill_status', 'ai_status'])
    .where('id', '=', billId)
    .executeTakeFirst();

  if (!bill) throw new Error('Bill not found');

  const alreadyTracked = await db
    .selectFrom('user_bills')
    .select('bill_id')
    .where('user_id', '=', userId)
    .where('bill_id', '=', billId)
    .executeTakeFirst();

  if (alreadyTracked) return { tracked: false };

  await db
    .insertInto('user_bills')
    .values({
      user_id: userId,
      bill_id: billId,
      adopted_at: new Date(),
      tenant_id: tenantId ?? null,
    })
    .execute();

  if (tenantId) {
    const existingOrgBill = await db
      .selectFrom('org_bills')
      .select('bill_id')
      .where('tenant_id', '=', tenantId)
      .where('bill_id', '=', billId)
      .executeTakeFirst();

    // Seed from bill_status, NOT ai_status — ai_status is NULL for ~2/3 of
    // rows, which would force newly tracked bills into the first column.
    if (!existingOrgBill) {
      await db
        .insertInto('org_bills')
        .values({
          tenant_id: tenantId,
          bill_id: billId,
          bill_status:
            (bill.bill_status as BillStatus) ?? (bill.ai_status as BillStatus) ?? 'unassigned',
        })
        .execute();
    }
  }

  return { tracked: true };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors. (`BillStatus` is already imported in this file for
`trackBill`; if typecheck says otherwise, add it to the existing `@/db/types` import.)

- [ ] **Step 3: Commit**

```bash
git add src/db/queries/bills-write.ts
git commit -m "feat: add trackBillById for tracking bills from search"
```

---

### Task 5: Transport arms — actions, routes, data-client

**Files:**
- Modify: `src/app/actions/bills.ts`
- Create: `src/app/api/bills/search/route.ts`
- Create: `src/app/api/bills/track/route.ts`
- Modify: `src/lib/data-client/bills.client.ts`

**Interfaces:**
- Consumes: `searchBills`, `SearchBillsParams`, `BillSearchResponse` (Task 3); `trackBillById` (Task 4); `filtersToQueryString`, `parseSearchParams` (Task 1).
- Produces: `data.bills.searchBills(params)` and `data.bills.trackBillById(params)` on the data-client.

- [ ] **Step 1: Add the server actions**

Append to `src/app/actions/bills.ts`. Note this file is `'use server'`, so it may
export **only async functions** — `SearchBillsParams` comes from
`@/db/queries/bills-read` and `TrackBillByIdParams` is declared in the plain
`bills.client.ts` module, not exported from here.

```ts
import { searchBills, type SearchBillsParams } from '@/db/queries/bills-read';
import { trackBillById } from '@/db/queries/bills-write';
import type { BillSearchResponse } from '@/types/legislation';

/**
 * Mirrors GET /api/bills/search. Public: no session required, because browsing
 * and searching the corpus is open — only tracking is gated.
 */
export async function searchBillsAction(params: SearchBillsParams): Promise<BillSearchResponse> {
  return searchBills(params);
}

/** Mirrors POST /api/bills/track. Requires a session; validates org membership. */
export async function trackBillByIdAction(params: {
  billId: string;
  tenantId?: string;
}): Promise<{ tracked: boolean }> {
  const { user } = await requireSession.fromAction();
  if (params.tenantId) {
    await requireMembership.fromAction(params.tenantId);
  }
  return trackBillById(user.id, params.billId, params.tenantId);
}
```

- [ ] **Step 2: Add the search route**

Create `src/app/api/bills/search/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { optionalSession } from '@/lib/auth/auth-guards';
import { searchBills } from '@/db/queries/bills-read';
import { parseSearchParams, SEARCH_PAGE_SIZE } from '@/lib/bills/search-params';

export async function GET(request: NextRequest) {
  try {
    // Public endpoint: resolve the user if present, but never require one.
    await optionalSession.fromRequest(request);

    const { searchParams } = new URL(request.url);
    const filters = parseSearchParams(searchParams);
    const cursor = searchParams.get('cursor');

    const result = await searchBills({
      ...filters,
      cursor,
      limit: SEARCH_PAGE_SIZE,
    });

    return NextResponse.json(result, {
      status: 200,
      // Private + short-lived: a hard remount reuses the browser cache without
      // any shared cache ever holding a response.
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bills search GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add the track route**

Create `src/app/api/bills/track/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireMembership } from '@/lib/auth/auth-guards';
import { trackBillById } from '@/db/queries/bills-write';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { billId, tenantId } = await request.json();

    if (!billId || typeof billId !== 'string') {
      return NextResponse.json({ error: 'billId is required' }, { status: 400 });
    }
    if (tenantId) {
      await requireMembership.fromRequest(request, tenantId);
    }

    const result = await trackBillById(user.id, billId, tenantId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bills track POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Add the fetch arms and register the ops**

In `src/lib/data-client/bills.client.ts`, add to the imports:

```ts
import { searchBillsAction, trackBillByIdAction } from '@/app/actions/bills';
import type { BillSearchResponse } from '@/types/legislation';
import type { SearchBillsParams } from '@/db/queries/bills-read';
import { filtersToQueryString } from '@/lib/bills/search-params';
```

Add the two fetch arms before `defineClient`:

```ts
async function searchBillsFetch(params: SearchBillsParams): Promise<BillSearchResponse> {
  const qs = filtersToQueryString(params, params.cursor);
  const res = await fetch(`/api/bills/search?${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to search bills');
  }
  return (await res.json()) as BillSearchResponse;
}

async function trackBillByIdFetch(params: {
  billId: string;
  tenantId?: string;
}): Promise<{ tracked: boolean }> {
  const res = await fetch('/api/bills/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to track bill');
  }
  return (await res.json()) as { tracked: boolean };
}
```

Then extend the `defineClient` call:

```ts
export const billsClient = defineClient('bills', {
  getBills: { action: getBillsAction, fetch: getBillsFetch },
  updateStatus: { action: updateBillStatusAction, fetch: updateBillStatusFetch },
  compareVersions: { action: compareVersionsAction, fetch: compareVersionsFetch },
  searchBills: { action: searchBillsAction, fetch: searchBillsFetch },
  trackBillById: { action: trackBillByIdAction, fetch: trackBillByIdFetch },
});
```

- [ ] **Step 5: Verify both arms typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both pass. The build is what catches an illegal non-async export
sneaking into the `'use server'` file — if it fails with a `'use server'`
complaint, move the offending type into a plain module.

- [ ] **Step 6: Verify the route answers**

Run:
```bash
npm run dev &
sleep 8
curl -s "http://localhost:9002/api/bills/search?q=agriculture&years=2026" | head -c 400
kill %1
```
Expected: JSON with `items`, `nextCursor`, and a non-zero `totalCount`.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/bills.ts src/app/api/bills/search/route.ts src/app/api/bills/track/route.ts src/lib/data-client/bills.client.ts
git commit -m "feat: add search and track transport arms to the data-client"
```

---

### Task 6: `useBillSearch` hook

**Files:**
- Create: `src/hooks/use-bill-search.ts`

**Interfaces:**
- Consumes: `data.bills.searchBills` (Task 5); `SearchFilters`, `normalizeFilters`, `DEFAULT_FILTERS` (Task 1).
- Produces: `useBillSearch(filters: SearchFilters)` returning `{ bills, totalCount, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, error }`.

- [ ] **Step 1: Write the hook**

Create `src/hooks/use-bill-search.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { data } from '@/lib/data-client';
import {
  normalizeFilters,
  SEARCH_PAGE_SIZE,
  type SearchFilters,
} from '@/lib/bills/search-params';
import type { BillSearchResult } from '@/types/legislation';

/** Delays a value by `ms`, so one query fires per typing pause, not per key. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Paged bill search backed by React Query's cache. Filter toggles, repeated
 * queries, and back-navigation all hit the cache instead of the network; only a
 * genuinely new filter set costs a request.
 */
export function useBillSearch(filters: SearchFilters) {
  // Only the text query is debounced — filter clicks should feel immediate.
  const debouncedQuery = useDebounced(filters.q, 250);
  const effective = normalizeFilters({ ...filters, q: debouncedQuery });

  const query = useInfiniteQuery({
    queryKey: ['bills', 'search', effective],
    queryFn: ({ pageParam }) =>
      data.bills.searchBills({
        ...effective,
        cursor: pageParam as string | null,
        limit: SEARCH_PAGE_SIZE,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    // Keeps the previous results on screen while the next query resolves, so
    // the list never flashes empty mid-typing.
    placeholderData: (previous) => previous,
  });

  const bills: BillSearchResult[] = query.data?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return {
    bills,
    totalCount,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error as Error | null,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-bill-search.ts
git commit -m "feat: add useBillSearch infinite query hook"
```

---

### Task 7: Track button with login guard

**Files:**
- Create: `src/components/search/track-button.tsx`

**Interfaces:**
- Consumes: `data.bills.trackBillById` (Task 5); `useAuth()` from `@/hooks/contexts/auth-context` (`{ user, activeTenant }`); `LoginDialog` from `@/components/auth/login-dialog` (accepts a `trigger` prop); `useToast` from `@/hooks/use-toast`.
- Produces: `<TrackButton billId={string} billNumber={string} />`.

- [ ] **Step 1: Write the component**

Create `src/components/search/track-button.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoginDialog } from '@/components/auth/login-dialog';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { data } from '@/lib/data-client';

interface TrackButtonProps {
  billId: string;
  billNumber: string;
}

/**
 * Tracks a bill to the user's active org board. For logged-out visitors the
 * same button opens the login dialog in place, so a visitor never loses their
 * search results to a redirect.
 */
export function TrackButton({ billId, billNumber }: TrackButtonProps) {
  const { user, activeTenant } = useAuth();
  const { toast } = useToast();
  const [isTracking, setIsTracking] = useState(false);
  const [isTracked, setIsTracked] = useState(false);

  if (!user) {
    return (
      <LoginDialog
        trigger={
          <Button size="sm" variant="outline" className="min-h-[44px] md:min-h-0">
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Track
          </Button>
        }
      />
    );
  }

  const handleTrack = async () => {
    setIsTracking(true);
    try {
      const result = await data.bills.trackBillById({
        billId,
        tenantId: activeTenant?.tenantId,
      });
      setIsTracked(true);
      toast({
        title: result.tracked ? `${billNumber} tracked` : `${billNumber} was already tracked`,
        description: result.tracked
          ? activeTenant
            ? `Added to ${activeTenant.name}'s board.`
            : 'Added to your bills.'
          : undefined,
      });
    } catch (error) {
      toast({
        title: 'Could not track bill',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsTracking(false);
    }
  };

  return (
    <Button
      size="sm"
      variant={isTracked ? 'secondary' : 'outline'}
      onClick={handleTrack}
      disabled={isTracking || isTracked}
      aria-label={isTracked ? `${billNumber} is tracked` : `Track ${billNumber}`}
      className="min-h-[44px] md:min-h-0"
    >
      {isTracking ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : isTracked ? (
        <Check className="mr-1 h-4 w-4" aria-hidden="true" />
      ) : (
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
      )}
      {isTracked ? 'Tracked' : 'Track'}
    </Button>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/search/track-button.tsx
git commit -m "feat: add track button with login guard for search results"
```

---

### Task 8: Search result card

**Files:**
- Create: `src/components/search/bill-search-card.tsx`

**Interfaces:**
- Consumes: `BillSearchResult` (Task 3); `TrackButton` (Task 7); `formatBillStatusName` from `@/lib/core/utils`.
- Produces: `<BillSearchCard bill={BillSearchResult} query={string} />`, memoized.

- [ ] **Step 1: Write the component**

Create `src/components/search/bill-search-card.tsx`:

```tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { CircleDot, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { TrackButton } from './track-button';
import { formatBillStatusName } from '@/lib/core/utils';
import type { BillSearchResult } from '@/types/legislation';

/**
 * Wraps query matches in <mark> so users can see WHY a bill matched. Splits on
 * whitespace and escapes each token, since the query is user input.
 */
function highlight(text: string, query: string): React.ReactNode {
  const tokens = query.trim().split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return text;

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(pattern);

  return parts.map((part, i) =>
    pattern.test(part) && i % 2 === 1 ? (
      <mark key={i} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-900/60">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

interface BillSearchCardProps {
  bill: BillSearchResult;
  query: string;
}

/**
 * One search result. Purpose-built rather than reusing KanbanCard, which is
 * coupled to drag state, assignment dialogs, and tag editing.
 *
 * The year chip is load-bearing, not decorative: Hawaii reuses bill numbers
 * across sessions (SB1251 exists in both 2025 and 2026 as different measures),
 * so without the year two results are indistinguishable.
 */
function BillSearchCardComponent({ bill, query }: BillSearchCardProps) {
  return (
    <Card className="p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/bills/${bill.id}`}
              className="font-mono text-sm font-semibold text-primary hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {highlight(bill.bill_number, query)}
            </Link>
            {bill.year !== null && (
              <Badge variant="outline" className="text-xs">
                {bill.year}
              </Badge>
            )}
            {/* Card state reads through an icon chip, never a left-edge strip. */}
            {bill.dead ? (
              <Badge variant="secondary" className="gap-1 text-xs text-muted-foreground">
                <XCircle className="h-3 w-3" aria-hidden="true" />
                Dead
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 text-xs">
                <CircleDot className="h-3 w-3" aria-hidden="true" />
                {bill.bill_status ? formatBillStatusName(bill.bill_status) : 'Active'}
              </Badge>
            )}
          </div>

          <h3 className="mt-2 text-sm font-medium leading-snug">
            {highlight(bill.bill_title, query)}
          </h3>

          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {highlight(bill.description, query)}
          </p>
        </div>

        <div className="shrink-0">
          <TrackButton billId={bill.id} billNumber={bill.bill_number} />
        </div>
      </div>
    </Card>
  );
}

// Memoized: with 40 cards per page and several pages accumulated, re-rendering
// every card on each keystroke is the main render cost to avoid.
export const BillSearchCard = React.memo(BillSearchCardComponent);
```

- [ ] **Step 2: Confirm `formatBillStatusName` exists with that name**

Run: `grep -n "export function formatBillStatusName" src/lib/core/utils.ts`
Expected: one match. If the name differs, use the actual exported name.

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/search/bill-search-card.tsx
git commit -m "feat: add bill search result card"
```

---

### Task 9: Filter rail and mobile sheet

**Files:**
- Create: `src/components/search/search-filter-rail.tsx`
- Create: `src/components/search/search-filters-sheet.tsx`

**Interfaces:**
- Consumes: `SearchFilters`, `Chamber`, `DeadFilter`, `DEFAULT_FILTERS`, `activeFilterCount` (Task 1); `SIMPLIFIED_COLUMNS` from `@/lib/bills/kanban-columns`.
- Produces: `<SearchFilterRail filters onChange onClear />`, `<SearchFiltersSheet filters onChange onClear />`.

- [ ] **Step 1: Write the filter rail**

Create `src/components/search/search-filter-rail.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SIMPLIFIED_COLUMNS } from '@/lib/bills/kanban-columns';
import {
  activeFilterCount,
  type Chamber,
  type DeadFilter,
  type SearchFilters,
} from '@/lib/bills/search-params';

const YEARS = [2026, 2025];

interface SearchFilterRailProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  onClear: () => void;
}

/**
 * Filter controls, shared verbatim by the desktop rail and the mobile sheet so
 * the two can never drift. Uses real fieldset/legend + checkbox/radio elements,
 * which are keyboard-navigable and screen-reader-labeled by default.
 */
export function SearchFilterRail({ filters, onChange, onClear }: SearchFilterRailProps) {
  const toggleYear = (year: number) => {
    const years = filters.years.includes(year)
      ? filters.years.filter((y) => y !== year)
      : [...filters.years, year];
    onChange({ ...filters, years });
  };

  const toggleChamber = (chamber: Chamber) => {
    const chambers = filters.chambers.includes(chamber)
      ? filters.chambers.filter((c) => c !== chamber)
      : [...filters.chambers, chamber];
    onChange({ ...filters, chambers });
  };

  const toggleStage = (stageId: string) => {
    const stages = filters.stages.includes(stageId)
      ? filters.stages.filter((s) => s !== stageId)
      : [...filters.stages, stageId];
    onChange({ ...filters, stages });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Filters
        </h2>
        {activeFilterCount(filters) > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-auto p-1 text-xs">
            Clear all
          </Button>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Session</legend>
        {YEARS.map((year) => (
          <div key={year} className="flex items-center gap-2">
            <Checkbox
              id={`year-${year}`}
              checked={filters.years.includes(year)}
              onCheckedChange={() => toggleYear(year)}
            />
            <Label htmlFor={`year-${year}`} className="cursor-pointer text-sm font-normal">
              {year}
            </Label>
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Chamber</legend>
        {(['house', 'senate'] as Chamber[]).map((chamber) => (
          <div key={chamber} className="flex items-center gap-2">
            <Checkbox
              id={`chamber-${chamber}`}
              checked={filters.chambers.includes(chamber)}
              onCheckedChange={() => toggleChamber(chamber)}
            />
            <Label htmlFor={`chamber-${chamber}`} className="cursor-pointer text-sm font-normal capitalize">
              {chamber}
            </Label>
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Status</legend>
        <RadioGroup
          value={filters.deadFilter}
          onValueChange={(value) => onChange({ ...filters, deadFilter: value as DeadFilter })}
        >
          {(['all', 'alive', 'dead'] as DeadFilter[]).map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem value={value} id={`dead-${value}`} />
              <Label htmlFor={`dead-${value}`} className="cursor-pointer text-sm font-normal capitalize">
                {value === 'all' ? 'All bills' : value}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Stage</legend>
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            {filters.stages.length > 0 ? `${filters.stages.length} selected` : 'Any stage'}
          </summary>
          <div className="mt-2 space-y-2">
            {SIMPLIFIED_COLUMNS.map((column) => (
              <div key={column.id} className="flex items-center gap-2">
                <Checkbox
                  id={`stage-${column.id}`}
                  checked={filters.stages.includes(column.id)}
                  onCheckedChange={() => toggleStage(column.id)}
                />
                <Label
                  htmlFor={`stage-${column.id}`}
                  className="cursor-pointer text-xs font-normal capitalize"
                >
                  {column.title.toLowerCase()}
                </Label>
              </div>
            ))}
          </div>
        </details>
      </fieldset>
    </div>
  );
}
```

Note: do **not** re-export `DEFAULT_FILTERS` from this component. Consumers
import it directly from `@/lib/bills/search-params` — the project has no barrel
files, so every import points at the module that actually defines the symbol.

- [ ] **Step 2: Write the mobile sheet**

Create `src/components/search/search-filters-sheet.tsx`:

```tsx
'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SearchFilterRail } from './search-filter-rail';
import { activeFilterCount, type SearchFilters } from '@/lib/bills/search-params';

interface SearchFiltersSheetProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  onClear: () => void;
}

/** Mobile-only wrapper: the same rail, slid in from the left on demand. */
export function SearchFiltersSheet({ filters, onChange, onClear }: SearchFiltersSheetProps) {
  const count = activeFilterCount(filters);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-[44px] lg:hidden">
          <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
          Filters
          {count > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1 text-xs">
              {count}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter bills</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          <SearchFilterRail filters={filters} onChange={onChange} onClear={onClear} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Verify `SIMPLIFIED_COLUMNS` shape and compile**

Run: `grep -n "SIMPLIFIED_COLUMNS" src/lib/bills/kanban-columns.ts && npm run typecheck`
Expected: the export exists with `{ id, title }` entries; typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/search/search-filter-rail.tsx src/components/search/search-filters-sheet.tsx
git commit -m "feat: add search filter rail and mobile filter sheet"
```

---

### Task 10: Search view and page

**Files:**
- Create: `src/components/search/bill-search-view.tsx`
- Modify: `src/app/(main)/search/page.tsx`

**Interfaces:**
- Consumes: `useBillSearch` (Task 6); `BillSearchCard` (Task 8); `SearchFilterRail`, `SearchFiltersSheet` (Task 9); `DEFAULT_FILTERS`, `activeFilterCount` (Task 1).
- Produces: the rendered `/search` route.

- [ ] **Step 1: Write the view**

Create `src/components/search/bill-search-view.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BillSearchCard } from './bill-search-card';
import { SearchFilterRail } from './search-filter-rail';
import { SearchFiltersSheet } from './search-filters-sheet';
import { useBillSearch } from '@/hooks/use-bill-search';
import { DEFAULT_FILTERS, type SearchFilters } from '@/lib/bills/search-params';

export function BillSearchView() {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const {
    bills,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useBillSearch(filters);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleClear = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  // Auto-load the next page when the sentinel scrolls into view. The visible
  // "Load more" button below stays the keyboard-accessible path — scroll-driven
  // loading alone is a screen-reader trap.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-6 p-4 md:p-6">
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-4">
          <SearchFilterRail filters={filters} onChange={setFilters} onClear={handleClear} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-6 md:px-6">
          <label htmlFor="bill-search" className="sr-only">
            Search bills by number, title, or description
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="bill-search"
              type="search"
              role="searchbox"
              placeholder="Search bill number, title, or text…"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              className="pl-9"
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {isLoading
                ? 'Searching…'
                : `${totalCount.toLocaleString()} ${totalCount === 1 ? 'bill' : 'bills'}${
                    filters.q.trim() ? ' · sorted by relevance' : ''
                  }`}
            </p>
            <SearchFiltersSheet filters={filters} onChange={setFilters} onClear={handleClear} />
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            Could not load bills: {error.message}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : bills.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium">No bills found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search term or clear your filters.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={handleClear}>
              Clear filters
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {bills.map((bill) => (
              <li key={bill.id}>
                <BillSearchCard bill={bill} query={filters.q} />
              </li>
            ))}
          </ul>
        )}

        <div ref={sentinelRef} aria-hidden="true" className="h-1" />

        {hasNextPage && (
          <div className="py-6 text-center">
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="min-h-[44px]"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the placeholder page**

Overwrite `src/app/(main)/search/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { BillSearchView } from '@/components/search/bill-search-view';

export const metadata: Metadata = {
  title: 'Search Bills',
  description: 'Search every bill in the Hawaii legislature by number, title, or text.',
};

export default function SearchPage() {
  return <BillSearchView />;
}
```

- [ ] **Step 3: Verify the full suite**

Run: `npm test && npm run typecheck && npm run build`
Expected: all three pass.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open `http://localhost:9002/search`, and check:
- Page loads showing 2026 bills with no search term.
- Typing `agriculture` returns title matches first, with terms highlighted.
- Typing `hb2` returns HB20, HB21, HB2xx.
- Toggling the 2025 checkbox changes results; toggling it back is instant (cached).
- Scrolling to the bottom loads more; the "Load more" button works via keyboard.
- Logged out, "Track" opens the login dialog.
- Logged in, "Track" adds the bill and the toast names the target board.
- At 375px width the rail is hidden and the Filters button opens the sheet.

- [ ] **Step 5: Commit**

```bash
git add src/components/search/bill-search-view.tsx "src/app/(main)/search/page.tsx"
git commit -m "feat: add bill search page with filters and infinite scroll"
```

---

## Self-Review Notes

**Spec coverage:** every spec section maps to a task — FTS migration (T2),
`searchBills` with both branches and keyset paging (T3), `trackBillById` (T4),
both transport arms (T5), three caching layers (T5 HTTP header + T6 React Query
+ T6 debounce), card with year chip and highlighting (T8), filter rail and
mobile sheet (T9), accessibility and empty/default states (T9, T10), tests (T1).

**Deferred by design:** typo tolerance (spec risk table — v1 accepts FTS having
none) and the introducer filter (spec non-goal).

**Type consistency:** `SearchFilters`, `BillSearchResult`, and
`BillSearchResponse` are defined once (T1, T3) and referenced by exact name
throughout; `trackBillById` returns `{ tracked: boolean }` in T4, T5, and T7.
