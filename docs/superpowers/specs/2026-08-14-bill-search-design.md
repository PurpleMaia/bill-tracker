# Bill Search Page — Design

**Date:** 2026-08-14
**Status:** Approved for planning
**Route:** `/search` (replaces the existing placeholder page)

## Problem

Every current bill query joins `user_bills`, so the app can only surface bills
someone already tracks. The database holds 6,126 bills across the 2025 and 2026
sessions, but there is no way to look at a bill nobody has adopted yet. Users who
want to find and start tracking a bill have to paste its capitol.hawaii.gov URL
into the track dialog — they must already know the bill exists and where it lives.

This page makes the full corpus searchable and turns discovery into a one-click
track.

## Goals

- Search all bills by **bill number**, **description**, and the **RELATING TO**
  title (`bills.bill_title`).
- Fast first paint and cheap keystrokes; results cached so re-querying and
  back-navigation cost nothing.
- Track a found bill to the user's active org board in one click.
- Logged-out visitors can browse and search freely; only tracking is gated.

## Non-Goals

- Searching bill version text or committee reports (`bill_versions.original_text`
  is large and not part of the requested scope).
- An introducer filter. The column is a free-text comma-joined string with 3,195
  distinct values and inconsistent casing; normalizing it is its own project.
- Replacing `searchBillsLocal()`. The board keeps its client-side search over the
  small tracked-bill set, where zero-latency filtering is the right tradeoff.

## Corpus Facts (measured 2026-08-14)

These numbers drove the design decisions below.

| Fact | Value | Consequence |
|---|---|---|
| Total bills | 6,126 | Too large to ship to the browser comfortably |
| By year | 2025: 3,172 · 2026: 2,954 | Year is the highest-value filter |
| Avg description | 317 chars (max 1,883) | ~3 MB raw corpus, ~700 KB gzipped |
| Dead | 5,699 (93%) | "Alive" is an aggressive filter, not a sane default |
| Archived | 3,172 (all of 2025) | `archived` ≈ "past session"; do not filter on it |
| Food-related | 616 | Search covers all legislation, not just food+ |
| Null titles / numbers | 0 / 0 | No null-handling needed for display |
| Duplicate (number, year) | 0 | Bill numbers repeat **across** sessions only |

**Bill numbers are reused between sessions.** `SB1251` exists in both 2025 and
2026 as genuinely different measures with different URLs. The year must appear on
every card or users cannot distinguish them.

## Architecture

### 1. Database — full-text search index

One migration, `000031_bill_search_index`, adds a generated `tsvector` column and
its indexes.

```sql
ALTER TABLE bills ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(bill_number,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(bill_title,'')),  'B') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'C')
  ) STORED;

CREATE INDEX bills_search_vector_idx ON bills USING GIN (search_vector);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX bills_number_trgm_idx ON bills USING GIN (bill_number gin_trgm_ops);
CREATE INDEX bills_browse_idx ON bills (year, updated_at DESC);
```

**Why a tsvector.** It stores stemmed, stop-word-stripped lexemes with positions,
so `insurance` / `insuring` / `insured` all match one lexeme (`insur`), and the
"RELATING TO" prefix shared by every title contributes nothing to relevance.
Verified against the real `HB20` row:

```
'hb20':1A 'relat':2B 'lava':4B,9C 'zone':5B,10C 'insur':6B,11C,18C
'establish':7C 'fund':12C,35C 'subsid':14C 'premium':19C ...
```

**Why setweight.** The A/B/C stamps let `ts_rank` score a title hit above a
description hit without any application scoring code — the same tiered intent as
`bill-search.ts` (`TITLE_SUBSTRING=40` vs `DESCRIPTION_SUBSTRING=20`), evaluated
in-index across all 6,126 rows.

**Why GENERATED … STORED.** Postgres recomputes the column on every insert and
update, so scraper writes keep the index correct with no trigger and no sync job.

**Why the index is required, not premature.** The exact ranked query measured
**157 ms** with a sequential scan on 6,126 rows. Per keystroke that is unusable;
the GIN index turns it into an inverted-list intersection.

**Verified behavior.** Searching `agriculture` correctly returns
`RELATING TO AGRICULTURAL TOURISM` (stemming works) ranked above
`RELATING TO THE TRANSFER OF NON-AGRICULTURAL PARK LANDS` (weighting works).

### 2. Query layer — `searchBills()`

New function in `src/db/queries/bills-read.ts`. This is the first query over the
whole `bills` table with **no `user_bills` join**.

```ts
interface SearchBillsParams {
  q?: string;
  years?: number[];              // [] = all
  chambers?: ('house'|'senate')[];
  stages?: string[];             // SIMPLIFIED_COLUMNS ids
  deadFilter?: 'all'|'alive'|'dead';
  cursor?: string;
  limit?: number;                // default 40
}
interface SearchBillsResult {
  items: BillSearchResult[];
  nextCursor: string | null;
  totalCount: number;
}
```

**Two query branches.** If `q` matches `/^[hs][bcr]?\s*-?\d+/i` it is a bill-number
lookup: rank exact `bill_number` matches first, then trigram prefix matches. FTS
cannot prefix-match inside a token, and partial numbers (`"hb2"` → HB20, HB21…)
are the most common real partial query. Otherwise use
`websearch_to_tsquery('english', q)` against `search_vector`, ordered by
`ts_rank` desc.

**Chamber** derives from the `bill_number` prefix (`HB%` / `SB%`) — no new column.

**Stage** filters via `STATUS_TO_SIMPLIFIED` from `lib/bills/kanban-columns.ts`,
which already groups the 28 `BillStatus` values into 13 pipeline stages. The raw
enum is far too granular for a filter list; this mapping already exists and is
the vocabulary the board uses.

**Keyset pagination, not OFFSET.** The cursor encodes `(rank, updated_at, id)`.
Offset pagination degrades on deep pages; keyset stays flat.

**Lean projection.** Returns a new `BillSearchResult` type — id, bill_number,
bill_title, description, year, bill_status, dead, bill_url — and deliberately
does **not** call `getAdditionalBillData()`, which issues extra queries per bill
set for tags, status updates, and versions. Search cards display none of that.

### 3. Tracking — `trackBillById()`

New function in `src/db/queries/bills-write.ts`, beside the existing
`trackBill(userId, billUrl)`.

The existing function looks a bill up by URL and **scrapes capitol.hawaii.gov if
it is missing**. From search results the bill provably exists and we hold its id,
so that entire path is dead weight. `trackBillById(userId, billId, tenantId)`
keeps the parts that matter — the already-tracked guard, the `user_bills` insert,
and the `org_bills` seeding that gives the org its starting status — and skips
the lookup and the scrape.

The URL-based `trackBill` is left untouched for the "track a new bill" dialog,
which genuinely needs the scrape fallback.

Behavior: inserts `user_bills` scoped to the active tenant and seeds `org_bills`
on the org's first adoption, matching current board behavior exactly.

### 4. Transport — data-client contract

Both arms, per the project's switchable-transport rule:

- `src/app/api/bills/search/route.ts` — GET, `optionalSession` guard so
  logged-out browsing works.
- `src/app/api/bills/track/route.ts` — POST, `requireSession`.
- `src/app/actions/bills.ts` — `searchBillsAction`, `trackBillByIdAction`.
- `src/lib/data-client/bills.client.ts` — matching fetch arms, registered as
  `{ action, fetch }` pairs in `defineClient`.

Param parsing and normalization live in `src/lib/bills/search-params.ts` (pure,
DB-free, unit-tested) and are shared by both arms so they cannot drift.

### 5. Caching

Three layers, addressing the "not intensive on the browser" requirement:

1. **React Query `useInfiniteQuery`** keyed on `['bills','search', normalizedFilters]`,
   `staleTime: 5min`, `gcTime: 30min`. Repeat queries, filter toggles, and
   back-navigation are served from memory with no network call.
2. **HTTP `Cache-Control: private, max-age=60`** on the search route, so a hard
   remount still reuses the browser cache.
3. **250 ms debounce + `keepPreviousData`**, so results never flash empty between
   keystrokes and one query fires per pause, not per character.

Filter normalization (sorted arrays, trimmed/lowercased query) is what makes the
cache key stable — without it, `[2025,2026]` and `[2026,2025]` would be cache
misses of each other.

**Render cost** is bounded by paging, not virtualization: 40 cards per page,
`React.memo` on the card, stable `useCallback` handlers. At a few hundred
rendered cards this stays smooth; a virtualization dependency is not justified
until measurement says otherwise.

## UI

### Desktop (≥1024px)

```
┌────────────┬──────────────────────────────────────┐
│ FILTERS    │ 🔍 Search bill number, title, text…  │
│  Clear all │ 1,204 bills · sorted by relevance    │
│            ├──────────────────────────────────────┤
│ Session    │ ┌──────────────────────────────────┐ │
│ ☑ 2026     │ │ HB20  ·  2026  ·  ◷ Introduced   │ │
│ ☐ 2025     │ │ RELATING TO LAVA ZONE INSURANCE  │ │
│            │ │ Establishes a Lava Zone Insur…   │ │
│ Chamber    │ │                       [+ Track]  │ │
│ ☐ House    │ └──────────────────────────────────┘ │
│ ☐ Senate   │ ┌──────────────────────────────────┐ │
│            │ │ SB905 ·  2026  ·  ✕ Dead         │ │
│ Status     │ │ RELATING TO AGRICULTURE.         │ │
│ ○ All      │ │ Short form bill.                 │ │
│ ○ Alive    │ │                       [+ Track]  │ │
│ ○ Dead     │ └──────────────────────────────────┘ │
│            │            ⟳ loading more…           │
│ Stage    ▾ │                                      │
└────────────┴──────────────────────────────────────┘
```

Filter rail is 240px, sticky. "Stage" is collapsed by default.

### Mobile (375px)

Sticky search bar; a **Filters** button with an active-count badge opens the
existing `Sheet` from the left. Active filters also render as removable chips
under the search bar, reusing the `FilterChipsRow` pattern from the board.

### Card — `BillSearchCard` (new)

Purpose-built rather than reusing `KanbanCard`, which is coupled to drag state,
assignment dialogs, tag editing, and org removal — reusing it would pull the
entire board context into this page.

Layout: bill number in monospace as the anchor; **year and status as chips on the
top row** (year is load-bearing — numbers repeat across sessions); RELATING TO
title as the heading; description clamped to two lines; Track button
bottom-right.

Dead/alive state reads through an **icon medallion and chip — no left-edge accent
strip**, per the project's card-state convention.

Matched search terms are wrapped in `<mark>` in the title and description so
users can see *why* a bill matched.

Clicking the card body opens the existing bill details view; the Track button
calls `stopPropagation`.

### Track button states

| Condition | Render |
|---|---|
| Logged out | `Track` → opens `LoginDialog` in place, user keeps their results |
| Logged in, untracked | `Track` → spinner → `✓ Tracked` + undo toast |
| Already tracked | Filled `✓ Tracked` state, click untracks |
| No active org | `Track` tracks personally (`tenant_id` null) |

### Defaults and empty state

Default view is **year 2026** (the live session), all statuses, dead bills
included but visually de-emphasized. With an empty search box the page browses
all matching bills sorted by `updated_at` desc — it works as a bill directory,
not a blank prompt.

Defaulting to alive-only was rejected: it would hide 93% of the corpus behind a
filter the user must discover. Filtering out `archived` was rejected because all
3,172 of the 2025 bills are archived, so it would make the 2025 filter return
nothing.

### Accessibility

- Search input is labeled with `role="searchbox"`; result count announced via
  `aria-live="polite"`.
- Filters are real `fieldset`/`legend` with checkboxes and radios, not divs —
  keyboard-navigable by default.
- The infinite-scroll sentinel is paired with a real **Load more** button that is
  always keyboard-reachable; scroll-triggered loading alone is a screen-reader
  trap.
- 44×44px minimum touch targets on mobile.

## Files

**New**
- `src/db/migrations/000031_bill_search_index.{up,down}.sql`
- `src/lib/bills/search-params.ts` — pure parse/normalize/serialize + cursor codec
- `src/app/api/bills/search/route.ts`, `src/app/api/bills/track/route.ts`
- `src/hooks/use-bill-search.ts`
- `src/components/search/bill-search-view.tsx`
- `src/components/search/bill-search-card.tsx`
- `src/components/search/search-filter-rail.tsx`
- `src/components/search/search-filters-sheet.tsx`
- `src/components/search/track-button.tsx`
- `src/lib/__tests__/search-params.test.ts`

**Modified**
- `src/db/queries/bills-read.ts` — `+searchBills()`
- `src/db/queries/bills-write.ts` — `+trackBillById()`
- `src/app/actions/bills.ts` — two action wrappers
- `src/lib/data-client/bills.client.ts` — two fetch arms + registration
- `src/app/(main)/search/page.tsx` — replaces the placeholder
- `src/types/legislation.ts` — `+BillSearchResult`

## Testing

Unit tests in `src/lib/__tests__/search-params.test.ts` covering pure logic only,
per project convention (no DB, no mocks):

- Bill-number detection: `"hb20"`, `"HB 20"`, `"sb-1251"` match; `"housing"` does not.
- Filter normalization produces stable cache keys regardless of input order.
- Cursor encode/decode round-trips.
- Chamber-prefix derivation from bill numbers.

Then `npm test`, `npm run typecheck`, and `npm run build` — the build catches
`'use server'` export violations that typecheck does not.

Manual verification: search `agriculture` returns title matches above description
matches; `hb2` returns HB20/HB21/HB2xx; a same-numbered bill in both sessions is
distinguishable by its year chip; track works logged-in and gates logged-out.

## Risks

| Risk | Mitigation |
|---|---|
| Migration adds ~2–3 MB and a GIN build | Seconds on 6k rows; down migration drops column, indexes, and extension cleanly |
| `CREATE EXTENSION pg_trgm` may be restricted on the managed production host | Verified available and creatable on local Postgres 17.5. `pg_trgm` is on the standard allowlist for every major managed Postgres (RDS, Supabase, Neon, Railway). If a host does refuse it, the FTS branch still works alone — only partial bill-number matching degrades, and `bill_number ILIKE 'hb2%'` is an adequate fallback for the prefix case since the column is short |
| FTS has no typo tolerance, unlike `searchBillsLocal` | Accepted for v1. If needed, extend `pg_trgm` to `bill_title` and add a similarity fallback when FTS returns few rows — ~20 lines, one extra index, no schema change |
| First query over the untracked corpus could surface unclassified bills | Expected — the page is explicitly about all Hawaii legislation, not just food+ |
