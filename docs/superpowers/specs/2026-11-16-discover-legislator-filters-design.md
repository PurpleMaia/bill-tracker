# Discover: filter by introducer and by committee chair — design

Date: 2026-11-16
Status: draft, pending approval

## Why

Advocates use Discover to plan who to talk to. Two real asks:

1. **"What has Rep. X introduced?"** Find every bill a given legislator put
   their name on, listed alphabetically.
2. **"What is waiting on Sen. Y right now?"** Find the bills currently sitting in
   a committee that Sen. Y chairs, because the chair decides whether a bill gets
   a hearing. This list exists to **move bills forward**. A bill that merely
   passed through that committee at some point is noise.

Success: an advocate picks a legislator from an A–Z list and gets a correct,
actionable list of bills in a couple of clicks, combinable with the existing
Discover filters.

## Goals

- **"Introduced by" filter.** Pick one legislator; show bills where they are
  **any** of the introducers (not just the primary/first-listed one).
- **"Waiting on chair" filter.** Pick one legislator; show bills whose
  **current** committee is one they actively chair **or vice-chair**. The
  picker lists vice-chairs too, labelled as such.
- **Legislator picker** sorted A–Z by last name, used by both filters.
- **Sort control** with "Relevance" and "Title A–Z".
- Both filters combine with the existing year / chamber / stage / alive-dead /
  tracked filters and with the text query, and round-trip through the URL like
  the existing filters.

## Non-goals

- Multi-legislator selection (one legislator per filter in v1).
- "Primary introducer only" mode.
- Bills referred to a chair's committee at any point (historical). Explicitly
  rejected; only *currently waiting* counts.
- Changes to the contact page beyond reading the stored current committee.
- Legislator profile pages.

## Anti-goals (would make this a failure even if it "works")

- **Wrong-person matches.** Surname-matching the raw introducer string at query
  time (two legislators named Lee, "LEE" inside "KLEE"). A filter that silently
  includes another legislator's bills is worse than no filter.
- **Discover and the contact page disagreeing** about which committee a bill is
  in. Both must come from the same `inferCurrentCommittee` logic.
- **Pointing at the wrong committee.** In `committee_assignment`, the first code
  is cleared first. The current committee is the *earliest one not yet cleared*,
  not the last one listed. A deferral does not clear a committee. A joint
  referral (`WLA/EIG`) is one concurrent step.
- Breaking pagination. Every sort mode must page without skips or repeats.

## Current state (what exists)

- `bills.introducer`: free text from the scraper, e.g.
  `"KEOHOKALOLE, LEE, M., MORIWAKI (Introduced by request of another party)"`.
  Order is meaningful (first = primary). Not linked to any legislator row.
  `parseIntroducers` (`src/lib/legislators/governor-contact.ts`) already splits
  it into surname tokens, re-attaching initials ("LEE, M.") and dropping
  parenthetical notes.
- `legislators` table (member_id, first/last name, chamber, district, party,
  `in_office`, …).
- `committees` + `committee_chairs` (`role` ∈ chair | vice_chair, `is_active`)
  → `legislators`. Joined today in `src/db/queries/committee-chairs.ts`.
- `bills.committee_assignment`: free-text code list (`"AGR, EDN/FIN"`), parsed by
  `parseCommitteeCodes` (`src/lib/testimony/committees.ts`).
- `inferCurrentCommittee(committeeAssignment, updates)`: pure TS, computed live
  on the contact page only. Picks the furthest referral committee the status
  history explicitly names ("referred to", "committee(s) on", "heard by"). That
  matches the earliest-not-yet-cleared rule. **Known weak spot:** when no
  update names any referral code, it falls back to the *last* code in the list,
  which contradicts the rule.
- Discover search: `searchBills` in `src/db/queries/bills-read.ts` (keyset
  pagination on `(rank, coalesce(updated_at), id)`), filter types and URL codec
  in `src/lib/bills/search-params.ts`, UI in `src/components/search/*`
  (`search-filter-rail.tsx` is shared by the desktop rail and mobile sheet;
  `active-filter-chips.tsx` shows chips). Transport: the `/api/bills/search`
  route plus the `actions/bills.ts` action through `data.bills` (both arms must
  stay identical).
- **Bills and `status_updates` are written by an external scraper service**
  (`SCRAPER_API_URL`), not by this app. Derived columns this app owns (e.g.
  `dead`) are recomputed by sweep scripts in `scripts/` (`update-dead-flags.ts`),
  currently run manually. The in-app "scrape updates" buttons
  (`components/scraper/*`) also refresh individual bills.

## Design

### 1. Data: link introducers to legislators

New table `bill_introducers`:

| column | type | notes |
|---|---|---|
| bill_id | uuid FK bills | |
| legislator_id | uuid FK legislators | |
| position | int | 0 = primary; preserves source order |

PK `(bill_id, legislator_id)`; index on `legislator_id`.

Resolution (pure function in `src/lib/legislators/`, unit-tested): take the
`parseIntroducers` tokens and match each one against legislators in the bill's
**originating chamber** (HB → House, SB → Senate), including former members
(see "Answered"). Match on surname, and
when the token has an initial ("LEE, M."), also on first initial. A token that
matches zero legislators or more than one is **skipped and logged, never
guessed**. Unresolved tokens are logged by whatever writes the links (see §3)
so the data can be fixed.

### 2. Data: store each bill's current committee

New nullable column `bills.current_committee text` (an upper-cased committee
code, or for a joint referral the joined step, e.g. `WLA/EIG`), with an index.

- This stored value is the **single source of truth** for "where is this bill
  now". Discover filters on it and the contact page reads it (instead of
  computing live), so the two can't disagree.
- **NULL** when the bill is not waiting in any committee: dead, out of committee
  (crossed to the floor or later stages), or no referral at all. The builder
  decides how to detect "out of committee", using `bill_status` and the existing
  stage helpers, and documents the rule in code.
- Fix the fallback: with no naming update, the current committee is the
  **first** referral code (or NULL if the bill's status shows it isn't in
  committee), not the last. Update the contact page's tests to match.
- Joint referral: the filter must match a chair or vice-chair of **either**
  committee in the step. Storing the step as a code array (`text[]`) instead of a string is
  acceptable if it makes the query cleaner. Builder's call.

### 3. Keeping derived data fresh

**Decided (Jaden, 2026-11-16): the external scraper service computes and
writes both** `bill_introducers` and `bills.current_committee` whenever it
inserts or updates a bill or its status updates. The in-app "scrape updates"
buttons call that same service, so they stay fresh with no extra work here.

This makes the feature **two-repo work**:

- **This repo (tracker)** owns the schema (the migration in §1/§2), the read
  side (search, picker, UI), and the **reference implementation**: pure TS
  functions `resolveIntroducers(introducer, billNumber, legislators)` and
  `currentCommitteeStep(committeeAssignment, updates, billStatus)` in
  `src/lib/`, with Vitest tests. These define the expected behaviour.
- **A shared fixture file** (`src/lib/__tests__/fixtures/legislator-links.json`:
  input → expected output, covering "LEE, M.", "(Introduced by request…)",
  joint referrals, deferrals, out-of-committee, no-naming-update) is run by
  both this repo's tests and the scraper's tests, so the two implementations
  can't drift.
- **Scraper service** ports both functions, passes the shared fixtures, and
  writes the two fields in the same transaction as the bill/status write.
  It logs unresolved introducer tokens.
- **Backfill:** a one-time idempotent script here,
  `scripts/backfill-legislator-links.ts` (modeled on `update-dead-flags.ts`),
  fills both fields for existing bills using the reference implementation.
  It is safe to re-run if the scraper's logic changes.
- **Rollout order:** build everything in this repo first (migration,
  reference logic, search, UI), then run the backfill **as the final step**
  (Jaden, 2026-11-16). Re-run it by hand until the scraper change ships.

### 4. Search query (`searchBills`)

Add to `SearchFilters`:

```ts
introducerId: string | null;   // legislators.id
chairId: string | null;        // legislators.id
sort: 'relevance' | 'title';
```

- `introducerId`: `EXISTS (select 1 from bill_introducers bi where bi.bill_id = bills.id and bi.legislator_id = $1)`.
- `chairId`: `bills.current_committee` matches an acronym of a committee where
  `committee_chairs.legislator_id = $1 and is_active` (role chair **or**
  vice_chair).
  Use EXISTS, never a join, so no rows get duplicated (same contract as the
  existing `isTrackedExpr`).
- Both slot into `applyFilters`, so the count and the page stay consistent.
- `normalizeFilters`, `activeFilterCount`, `filtersToQueryString`, and
  `parseSearchParams` gain the new fields (URL keys e.g. `introducer`, `chair`,
  `sort`). Unknown or malformed ids fall back to null. Extend
  `search-params.test.ts`.
- `DEFAULT_FILTERS`: `introducerId: null, chairId: null, sort: 'relevance'`.

### 5. Sorting and pagination

- `sort = 'title'`: order by `lower(coalesce(bill_title, ''))`, then `id`.
  This needs its own keyset cursor shape. Today's cursor is
  `[rank, updatedAt, id]`. The cursor must encode its sort mode, and a cursor
  from one mode must be rejected (treated as page 1) under the other.
- **Effective sort default:** when the user hasn't chosen a sort, a legislator
  filter is active, and there is no text query, use Title A–Z (relevance has no
  meaning without a query). An explicit user choice always wins. The builder
  decides where this resolution lives, but it must be a pure, tested function
  in `search-params.ts`.

### 6. Legislator list for the picker

- A new `db/queries` function returns legislators for the picker: id, display
  name, chamber, district, and for the chair filter the committees they
  actively chair or vice-chair, with the role. Sorted by **last name, then
  first name**, A–Z.
- Introducer picker: all legislators, former members marked "former".
- "Waiting on chair" picker: legislators with an active chair **or vice-chair**
  role, one entry per legislator, showing each committee with its role, e.g.
  `Lee, Mike (H-12) — Chair AGR · Vice Chair FIN`. Selecting them matches bills
  in any of those committees.
- Exposed through the data-client per CLAUDE.md: query function → action
  wrapper → fetch wrapper + route → `defineClient` entry, probably in the
  existing `data.legislators` domain. Small, static per session, so cache it
  like `CommitteeNamesProvider`.

### 7. UI

- Two new sections in `SearchFilterRail` (shared by the desktop rail and the
  mobile sheet): **"Introduced by"** and **"Waiting on chair"**, each a
  searchable single-select combobox (shadcn Popover + Command pattern), list
  sorted A–Z, with a clear button. Entries show `Last, First (H-12)`. Chair
  entries also show committee codes with Chair / Vice Chair.
- A short helper line under "Waiting on chair": something like "Bills currently
  in a committee this legislator chairs or vice-chairs."
  (Final copy is the builder's call. Follow the consolidate-don't-scatter
  education rule: one line, no extra tooltips.)
- Active-filter chips for both (`active-filter-chips.tsx`): "Introduced by
  Keohokalole", "Waiting on Lee (Chair AGR · Vice Chair FIN)".
- Optionally, on each result card under this filter, show which of the
  legislator's committees the bill is sitting in and their role there
  ("In AGR: Lee chairs"). That tells the advocate whether they're asking the
  chair or the vice-chair. Builder may defer this if it complicates the card.
- Sort control ("Relevance" / "Title A–Z") in the results header, next to the
  count.
- Empty states: chair filter with zero results → "Nothing is waiting on this
  chair right now," not a generic "no results."

## Constraints

- Kysely only, no raw-SQL files. All queries in `src/db/queries/*`. `src/lib`
  stays DB-free.
- Both transport arms (`/api/bills/search`, `actions/bills.ts`) take and return
  identical shapes.
- `'use server'` files export only async functions.
- Pure logic (introducer resolution, current-committee fix, filter codec,
  sort resolution, cursor encoding) gets Vitest coverage in
  `src/lib/__tests__/`.
- Migration is a numbered up/down pair (next: `000035_…`).
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build` (the build ignores type
  errors).

## Left to the builder

- Exact UI copy, combobox details, and where the sort control sits on mobile.
- `text` vs `text[]` for `current_committee`.
- The exact "out of committee" rule, as long as it's documented and tested.
- Batch size and logging format for the backfill script.
- The scraper-side port's structure (language and placement in that repo), as
  long as it passes the shared fixtures.

## Calls made during design review (Claude's, not yet confirmed)

- **Contact page reads the stored column.** `currentCommitteeStep` (wrapping
  the existing referral-walk logic plus the "out of committee → null" rule and
  joint-step output) is the reference. The scraper writes its result, and both
  Discover and the contact page read `bills.current_committee`, so they can't
  disagree. The contact page keeps its existing stage gating and handles a
  null or joint-pair value with minimal UI (both committees' chairs for a joint
  step). This is the one contact-page change in scope.
- **Chair filter is scoped to the live session.** Chairs are stored as current
  only (`is_active`), so "waiting on" only makes sense for live bills.
  `current_committee` is written only for bills in the current session's
  years and left NULL for others, so stale `dead` flags on old bills can't leak
  in.
- **A shared fixture file keeps the two implementations in sync** (§3), since
  the logic now lives in two codebases.

## Answered

- **Freshness: computed inside the scraper service** (Jaden, 2026-11-16). See §3.
- **Vice-chairs appear in "Waiting on chair"** (Jaden, 2026-11-16). They're
  listed in the picker with their role, and selecting one matches bills in
  committees they chair or vice-chair.

- **`legislators` includes past members and is kept up to date** (Jaden,
  2026-11-16). §1 matching therefore covers older bills too: match against all
  rows, not just `in_office`. Remaining edge: each row stores one `chamber` and
  there is no term start, so a member who switched chambers may not match their
  older bills from the other chamber. Those tokens are logged as unresolved,
  never guessed. The introducer picker lists **all** legislators (past members
  marked "former"), not only current ones.
