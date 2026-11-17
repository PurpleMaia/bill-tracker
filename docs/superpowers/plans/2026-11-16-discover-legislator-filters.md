# Discover Legislator Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Introduced by" and "Waiting on chair" (chair or vice-chair) filters plus a Title A–Z sort to the Discover page, backed by stored introducer links and a stored current committee.

**Architecture:** A migration adds `bill_introducers` and `bills.current_committee text[]`. Pure reference functions in `src/lib` (introducer resolution, current-committee step) define the behaviour. A shared JSON fixture lets the external scraper service port them later. A backfill script fills existing rows. `searchBills` gains two EXISTS filters and a second keyset sort mode. The filter rail gains two legislator comboboxes. The contact page reads the stored committee.

**Tech Stack:** Next.js 15, TypeScript, Kysely/Postgres, Vitest, shadcn/ui (Popover + Command).

**Spec:** `docs/superpowers/specs/2026-11-16-discover-legislator-filters-design.md`

## Global Constraints

- Kysely for all queries; queries live only in `src/db/queries/*`; `src/lib` stays DB-free.
- Both transport arms (`/api/bills/search` route, `searchBillsAction`) take `SearchBillsParams` and return `BillSearchResponse` unchanged in shape.
- `'use server'` files export only async functions; shared types go in plain modules (`src/types/legislation.ts`).
- No barrel files; import by deep path.
- Tests are pure Vitest in `src/lib/__tests__/` (flat).
- Commit prefixes `feat:` / `fix:` / `refactor:`; **no `Co-Authored-By` lines**.
- Each task ends green on `pnpm test` and `pnpm typecheck`; run `pnpm build` at Task 9 and Task 10.
- Introducer tokens that match zero or more than one legislator are **skipped and logged, never guessed**.
- "Waiting on chair" matches `committee_chairs.is_active = true` with role `chair` **or** `vice_chair`.
- `current_committee` is written only for bills whose `year` is in `LIVE_SESSION_YEARS` (`[2027, 2026]`), NULL otherwise.
- **Never run `pnpm migrate:up` or the backfill without first confirming with Jaden which database `DATABASE_URL` points to.**

## Review Focus

1. **Hawaiian names and multi-word surnames.** Introducer strings are upper-case ASCII ("KEOHOKALOLE", "SAN BUENAVENTURA"). DB names may carry ʻokina/macrons ("Keohokalole", "Kapela", "San Buenaventura"). These must still match. → Task 2 tests `normalizes okina, macrons and case` and `matches a multi-word surname`.
2. **A malformed or unknown legislator id in the URL** (hand-edited, or a stale link) must yield normal unfiltered results, not a 500 from a uuid cast. → Task 4 test `drops non-uuid introducer/chair ids`.
3. **An old or cross-mode cursor** (bookmarked URL from before this change, or a cursor from relevance mode reused after switching to title) must restart at page 1, not 500 or loop. → Task 4 tests `rejects a relevance cursor in title mode` and `rejects legacy 3-tuple cursor in title mode`.
4. **Bills with an empty or null title** in Title A–Z must sort by bill number, not pile up at the top. → Task 4 test on `titleSortKey`, used by Task 5.
5. **An introducer string that is only a note** ("(Introduced by request of another party)") or empty → zero links, zero unresolved, no crash. → Task 2 test `returns nothing for note-only strings`.

---

### Task 1: Migration and DB types

**Files:**
- Create: `src/db/migrations/000035_legislator_links.up.sql`, `src/db/migrations/000035_legislator_links.down.sql`
- Modify: `src/db/types.ts` (add `BillIntroducers`, `Bills.current_committee`, register `bill_introducers` in `DB`)

**Interfaces:**
- Produces: table `bill_introducers(bill_id uuid FK bills ON DELETE CASCADE, legislator_id uuid FK legislators, position int NOT NULL, PK(bill_id, legislator_id))`, index `bill_introducers_legislator_id_idx`; column `bills.current_committee text[] NULL` with GIN index `bills_current_committee_gin_idx`.
- Kysely: `BillIntroducers { bill_id: string; legislator_id: string; position: number }`, `Bills.current_committee: string[] | null`.

- [ ] **Step 1:** Write the up migration (comment header like `000034`, `IF NOT EXISTS` everywhere) and the down migration (drop index, column, table).
- [ ] **Step 2:** Hand-edit `src/db/types.ts` to match (do not run `pnpm codegen` against an unconfirmed DB).
- [ ] **Step 3:** Run `pnpm typecheck`. Expected: no new errors.
- [ ] **Step 4:** Ask Jaden which DB `DATABASE_URL` targets. Only with a go-ahead, run `pnpm migrate:up` then `pnpm migrate:down` then `pnpm migrate:up`. Expected: all three succeed.
- [ ] **Step 5:** Commit `feat: add bill_introducers table and bills.current_committee`.

---

### Task 2: Introducer resolution (reference logic)

**Files:**
- Create: `src/lib/legislators/introducer-links.ts`
- Create: `src/lib/__tests__/fixtures/legislator-links.json` (section `introducers`)
- Test: `src/lib/__tests__/introducer-links.test.ts`

**Interfaces:**
- Consumes: `parseIntroducers` from `src/lib/legislators/governor-contact.ts` (tokens like `"LEE, M."`, chamber from bill number).
- Produces:
  ```ts
  export interface LegislatorRef { id: string; firstName: string | null; lastName: string | null; chamber: string | null }
  export interface IntroducerLink { legislatorId: string; position: number }
  export interface IntroducerResolution { links: IntroducerLink[]; unresolved: string[] }
  export function normalizeName(s: string): string
  export function resolveIntroducers(introducer: string | null | undefined, billNumber: string, legislators: LegislatorRef[]): IntroducerResolution
  ```

- [ ] **Step 1: Write failing tests** driven by the fixture file. Each fixture case is `{ name, introducer, billNumber, expected: { links: [{ legislatorId, position }], unresolved: string[] } }`, sharing one `legislators` roster in the file. Required cases:
  - `primary and co-introducers keep source order`: `"KEOHOKALOLE, MORIWAKI"` on `SB100` → positions 0, 1.
  - `initial disambiguates same surname`: roster has House `Lee, Mike` and House `Lee, Nicole`; `"LEE, M."` on `HB1` → Mike only.
  - `bare ambiguous surname is unresolved`: `"LEE"` on `HB1` → `links: []`, `unresolved: ["LEE"]`.
  - `chamber filters matches`: Senate `Lee, Chris` is ignored for an `HB` bill.
  - `normalizes okina, macrons and case`: DB `Kapela` and `Keohokalole` (one stored with ʻokina, e.g. `Kaʻapuni`) match `"KAAPUNI"`.
  - `matches a multi-word surname`: `"SAN BUENAVENTURA"` → DB `San Buenaventura`.
  - `returns nothing for note-only strings`: `"(Introduced by request of another party)"` and `""` and `null` → `{ links: [], unresolved: [] }`.
  - `same legislator listed twice keeps first position`.
  - `former members still match`: a roster row is a former member (no special field needed; just present).
  Also a unit test: `normalizeName("Kaʻāpuni") === "kaapuni"`.
- [ ] **Step 2:** Run `pnpm vitest run src/lib/__tests__/introducer-links.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement. `normalizeName`: NFD, strip combining marks, remove `ʻ` `'` `‘` `’`, collapse whitespace, lowercase. Split each `parseIntroducers` token on `", "` into surname + optional initial. Candidates = roster rows whose `chamber` equals the token's chamber and whose normalized `lastName` equals the normalized surname. If an initial is present, also filter by the normalized `firstName` starting with it. Exactly one candidate → link; otherwise → `unresolved` (original token text).
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add introducer-to-legislator resolution with shared fixtures`.

---

### Task 3: Current committee step (reference logic) and fallback fix

**Files:**
- Modify: `src/lib/testimony/committees.ts` (fallback in `inferCurrentCommittee`; add `currentCommitteeStep`)
- Modify: `src/lib/__tests__/fixtures/legislator-links.json` (section `currentCommittee`)
- Test: `src/lib/__tests__/committees.test.ts`

**Interfaces:**
- Consumes: `inferCurrentCommittee`, `jointReferralPartners`, `parseCommitteeCodes` (same file).
- Produces:
  ```ts
  export const IN_COMMITTEE_STATUSES: ReadonlySet<string>  // introduced, scheduled1-3, waiting2-3, deferred1-3,
                                                            // crossoverWaiting1-3, crossoverScheduled1-3, crossoverDeferred1-3
  export function currentCommitteeStep(input: {
    committeeAssignment: string | null;
    updates: StatusLine[] | null | undefined;
    billStatus: string | null;
    dead: boolean;
  }): string[] | null   // sorted-as-referral, upper-cased codes of the current step; null if not in committee
  ```

- [ ] **Step 1: Write failing tests.**
  - Change the existing fallback expectation: with updates that name no referral code, `inferCurrentCommittee('AEN, WAM', [{ statustext: 'Introduced.' }])` → `'AEN'` (was last code).
  - Fixture-driven `currentCommitteeStep` cases `{ name, input, expected }`:
    - `waiting in second committee`: `'AEN, WAM'`, referred to WAM, status `waiting2` → `['WAM']`.
    - `joint step returns both`: `'WLA/EIG, FIN'`, referred to WLA/EIG, `introduced` → `['WLA','EIG']`.
    - `deferral does not clear`: `'AGR, FIN'`, "The committee(s) on AGR recommend(s) that the measure be deferred", `deferred1` → `['AGR']`.
    - `out of committee is null`: status `passedCommittees`, `conferenceAssigned`, `transmittedGovernor`, `governorSigns` → `null`.
    - `dead is null`: `dead: true`, status `waiting2` → `null`.
    - `no referral is null`: `committeeAssignment: null` → `null`.
    - `null status still computes`: `billStatus: null`, `'AGR, FIN'`, no updates → `['AGR']`.
- [ ] **Step 2:** Run `pnpm vitest run src/lib/__tests__/committees.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Fallback becomes `referral[0]`. `currentCommitteeStep`: return null if `dead`, if `billStatus` is non-null and not in `IN_COMMITTEE_STATUSES`, or if no referral; otherwise `jointReferralPartners(assignment, inferCurrentCommittee(...))`.
- [ ] **Step 4:** Run the test. Expected: PASS. Then run `pnpm test`. Expected: all pass (fix any other test that asserted the old last-code fallback, citing the referral-order rule).
- [ ] **Step 5:** Commit `fix: current committee falls back to first referral; add currentCommitteeStep`.

---

### Task 4: Filter state, URL codec, sort resolution, cursors

**Files:**
- Modify: `src/lib/bills/search-params.ts`
- Modify: `src/lib/bills/search-filter-storage.ts`
- Test: `src/lib/__tests__/search-params.test.ts`, `src/lib/__tests__/search-filter-storage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const LIVE_SESSION_YEARS: number[]          // [2027, 2026]; DEFAULT_FILTERS.years uses it
  export type SortChoice = 'auto' | 'relevance' | 'title'
  export type SortMode = 'relevance' | 'title'
  // SearchFilters gains:
  introducerId: string | null; chairId: string | null; sort: SortChoice
  // DEFAULT_FILTERS: introducerId: null, chairId: null, sort: 'auto'
  export function isUuid(s: string): boolean
  export function resolveSortMode(f: Pick<SearchFilters, 'q' | 'introducerId' | 'chairId' | 'sort'>): SortMode
  export function titleSortKey(title: string | null, billNumber: string | null): string
  export type SearchCursor =
    | { mode: 'relevance'; rank: number; updatedAt: string; id: string }
    | { mode: 'title'; key: string; id: string }
  export function encodeCursor(c: SearchCursor): string
  export function decodeCursor(raw: string, mode: SortMode): SearchCursor | null
  ```
  URL keys: `introducer`, `chair`, `sort` (omitted when null / `'auto'`).

- [ ] **Step 1: Write failing tests.**
  - `resolveSortMode`: explicit `'title'`/`'relevance'` always win; `'auto'` + legislator filter + empty `q` → `'title'`; `'auto'` + legislator filter + `q: 'food'` → `'relevance'`; `'auto'` with no legislator filter → `'relevance'`.
  - `titleSortKey('  ', 'HB12')` → `'hb12'`; `titleSortKey(null, 'SB3')` → `'sb3'`; `titleSortKey('Farm Bill', 'HB1')` → `'farm bill'`.
  - Round-trip: `parseSearchParams(new URLSearchParams(filtersToQueryString(f)))` preserves `introducerId`, `chairId`, `sort`.
  - `drops non-uuid introducer/chair ids`: `?introducer=abc&chair=1;drop` → both null.
  - `activeFilterCount` counts introducer and chair (one each); `sort` does not count.
  - Cursor: `rejects a relevance cursor in title mode`, `rejects legacy 3-tuple cursor in title mode`, `legacy 3-tuple decodes as relevance` (backward compatible), title round-trip.
  - Storage: persisted blob with the new fields round-trips; a blob missing them loads with defaults; a non-uuid id loads as null.
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3:** Implement. `titleSortKey` = lowercase of trimmed title, else trimmed bill number, else `''`. Title cursor encodes `['t', key, id]`; relevance keeps the existing 3-tuple so old cursors still work in relevance mode. `normalizeFilters` passes the new fields through.
- [ ] **Step 4:** Run the tests. Expected: PASS. Run `pnpm typecheck`. Expected: errors only where `SearchFilters` literals are built (fix them by spreading `DEFAULT_FILTERS`).
- [ ] **Step 5:** Commit `feat: legislator filters, sort choice and dual-mode cursor in search params`.

---

### Task 5: `searchBills` filters and title sort

**Files:**
- Modify: `src/db/queries/bills-read.ts` (`searchBills`, `applyFilters`, ordering, cursor)
- Modify: `src/app/api/bills/search/route.ts` (no logic change; confirm `parseSearchParams` carries new fields)

**Interfaces:**
- Consumes: `resolveSortMode`, `titleSortKey` semantics, `decodeCursor(raw, mode)`, `encodeCursor` (Task 4); tables from Task 1.
- Produces: same `searchBills(params: SearchBillsParams): Promise<BillSearchResponse>`.

- [ ] **Step 1:** Add to `applyFilters`:
  - `introducerId` → `EXISTS (select 1 from bill_introducers bi where bi.bill_id = bills.id and bi.legislator_id = $id)`.
  - `chairId` → `bills.current_committee && (select array_agg(c.acronym) from committee_chairs cc join committees c on c.id = cc.committee_id where cc.legislator_id = $id and cc.is_active)`. Upper-case acronyms on both sides (the column already stores upper case; wrap `upper(c.acronym)`).
  Use Kysely `sql` fragments as the file already does; no joins on the outer query.
- [ ] **Step 2:** Ordering by `resolveSortMode(params)`:
  - relevance: unchanged.
  - title: SQL expression equal to `titleSortKey` (`lower(coalesce(nullif(trim(bill_title), ''), trim(bill_number), ''))`), then `id`, both ascending. Keyset predicate `(key, id) > ($key, $id::uuid)`. `nextCursor` encodes `{ mode: 'title', key, id }` from the last row.
  A cursor that decodes to null for the active mode means page 1.
- [ ] **Step 3:** Run `pnpm typecheck`. Expected: clean.
- [ ] **Step 4: Manual verification** (dev DB only, after Task 1 Step 4 approval and with a few rows backfilled by Task 7, or seeded by hand): `curl 'localhost:9002/api/bills/search?introducer=<uuid>'` returns only that legislator's bills. Paging through `sort=title` with `cursor` shows no repeats, ascending order. `?introducer=abc` returns the unfiltered default. Record the results in the commit message body.
- [ ] **Step 5:** Commit `feat: filter Discover search by introducer and committee chair; title sort`.

---

### Task 6: Legislator picker options (query + both transports)

**Files:**
- Create: `src/db/queries/legislators.ts`
- Modify: `src/app/actions/legislators.ts` (add `getLegislatorOptionsAction`)
- Create: `src/app/api/legislators/route.ts` (GET)
- Modify: `src/lib/data-client/legislators.client.ts` (add `getOptions`)
- Modify: `src/types/legislation.ts` (option types)

**Interfaces:**
- Produces:
  ```ts
  // src/types/legislation.ts
  export interface LegislatorCommitteeRole { code: string; role: 'chair' | 'vice-chair' }
  export interface LegislatorOption {
    id: string; firstName: string; lastName: string;
    chamber: 'House' | 'Senate'; district: number | null; inOffice: boolean;
    committees: LegislatorCommitteeRole[];   // active roles only; empty for non-chairs
  }
  // src/db/queries/legislators.ts
  export async function getLegislatorOptions(): Promise<LegislatorOption[]>   // ORDER BY last_name, first_name
  // data client
  data.legislators.getOptions(): Promise<LegislatorOption[]>
  ```
  Both arms are public (`optionalSession`), matching the existing chairs action.

- [ ] **Step 1:** Implement the query: all legislators left-joined to active `committee_chairs` + `committees`, grouped into `committees[]` in TS (chair before vice-chair, then code). Map DB `vice_chair` to `'vice-chair'` (reuse the convention in `committee-chairs.ts`).
- [ ] **Step 2:** Add the action, the route (`Cache-Control: private, max-age=300`), and the `defineClient` entry `getOptions: { action, fetch }`.
- [ ] **Step 3:** Run `pnpm typecheck` and `pnpm build`. Expected: clean; no `'use server'` export violations.
- [ ] **Step 4:** Manual: `curl localhost:9002/api/legislators | head` shows A–Z by last name with committee roles.
- [ ] **Step 5:** Commit `feat: legislator picker options endpoint`.

---

### Task 7: Write-side query and backfill script

**Files:**
- Create: `src/db/queries/legislator-links.ts`
- Create: `scripts/backfill-legislator-links.ts`

**Interfaces:**
- Consumes: `resolveIntroducers`, `LegislatorRef` (Task 2); `currentCommitteeStep` (Task 3); `LIVE_SESSION_YEARS` (Task 4).
- Produces:
  ```ts
  export async function writeBillLegislatorLinks(billId: string, links: IntroducerLink[], currentCommittee: string[] | null): Promise<void>
    // one transaction: delete bill_introducers for bill, insert links, update bills.current_committee
  export async function getLegislatorRefs(): Promise<LegislatorRef[]>
  ```
  Script CLI: `npx tsx scripts/backfill-legislator-links.ts [--year 2026] [--dry-run]`.

- [ ] **Step 1:** Implement the query functions.
- [ ] **Step 2:** Implement the script, modeled on `scripts/update-dead-flags.ts`: load refs once; page through bills (id, bill_number, introducer, committee_assignment, bill_status, dead, year) and their `status_updates` (batched per page, not per bill). For each bill compute links. Compute `current_committee` only if `year ∈ LIVE_SESSION_YEARS`, else null. Write unless `--dry-run`. Print totals: bills processed, links written, bills with a current committee, and every unresolved token with its bill number. Idempotent by construction (delete-then-insert).
- [ ] **Step 3:** Run `pnpm typecheck`. Expected: clean. Run the script with `--dry-run --year 2026` **only after confirming the DB target with Jaden**. Expected: plausible counts, an unresolved list to eyeball.
- [ ] **Step 4:** Commit `feat: backfill script for introducer links and current committee`.

---

### Task 8: Contact page reads the stored committee

**Files:**
- Modify: `src/types/legislation.ts` (`Bill.current_committee?: string[] | null`)
- Modify: `src/db/queries/bill-mappers.ts` (map `current_committee`)
- Modify: `src/app/bills/[id]/contact/page.tsx:159-175`

**Interfaces:**
- Consumes: `currentCommitteeStep` (Task 3).

- [ ] **Step 1:** Map the column through `convertDataToBillShape`.
- [ ] **Step 2:** In the contact page, `currentCodes` = `bill.current_committee` when it is a non-empty array, else `currentCommitteeStep({...})` computed live (covers non-live years and pre-backfill rows). `currentCode` = first of `currentCodes`. Keep the existing "fall back to first group" and stage gating untouched.
- [ ] **Step 3:** Run `pnpm test` and `pnpm typecheck`. Expected: pass.
- [ ] **Step 4:** Manual: open `/bills/<id>/contact` for a bill in a joint referral. Both committees' chairs are foregrounded.
- [ ] **Step 5:** Commit `refactor: contact page uses stored current committee`.

---

### Task 9: Discover UI

**Files:**
- Create: `src/components/search/legislator-combobox.tsx`
- Modify: `src/components/search/search-filter-rail.tsx`, `src/components/search/active-filter-chips.tsx`, `src/components/search/bill-search-view.tsx`
- Create: `src/hooks/use-legislator-options.ts` (React Query, `staleTime: Infinity`, calls `data.legislators.getOptions`)

**Interfaces:**
- Consumes: `LegislatorOption` (Task 6), `SearchFilters` fields + `resolveSortMode` (Task 4).
- Produces:
  ```ts
  export function LegislatorCombobox(props: {
    label: string; options: LegislatorOption[]; value: string | null;
    onChange: (id: string | null) => void; showRoles?: boolean; emptyText: string;
  }): JSX.Element
  export function formatLegislatorLabel(o: LegislatorOption): string  // "Lee, Mike (H-12)" / "(former)"
  ```
  Put `formatLegislatorLabel` and `formatRoles(o): string` (`"Chair AGR · Vice Chair FIN"`) in `src/lib/legislators/legislator-labels.ts` with tests in `src/lib/__tests__/legislator-labels.test.ts`.

- [ ] **Step 1: Failing tests** for `formatLegislatorLabel` (House → `H-12`, Senate → `S-3`, null district → no suffix, former → ` (former)`) and `formatRoles` (chair first, `·` separator). Run them, expect FAIL, then implement, expect PASS.
- [ ] **Step 2:** Build `LegislatorCombobox` on shadcn `Popover` + `Command` (searchable, single select, clear button). Options are already sorted A–Z by the query; do not re-sort.
- [ ] **Step 3:** Rail: add "Introduced by" (all options) and "Waiting on chair" (options with `committees.length > 0`, `showRoles`), with the helper line "Bills currently in a committee this legislator chairs or vice-chairs." The rail is shared by the mobile sheet, so there's no separate mobile work.
- [ ] **Step 4:** Chips: "Introduced by {Last}" and "Waiting on {Last} ({formatRoles})", each removable.
- [ ] **Step 5:** Results header: replace the static " · sorted by relevance" with a small `Select` (Relevance / Title A–Z) whose displayed value is `resolveSortMode(filters)`; choosing sets `filters.sort`. Empty state when `chairId` is set and `totalCount === 0`: "Nothing is waiting on this legislator's committees right now."
- [ ] **Step 6:** Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Expected: all clean.
- [ ] **Step 7:** Manual in the browser (`pnpm dev`): pick an introducer and a chair, combine with a year and the stage filter, reload (URL and localStorage restore), switch sort, scroll past page 1, check mobile width.
- [ ] **Step 8:** Commit `feat: Discover legislator filters and sort control`.

---

### Task 10: Final verification and backfill run

- [ ] **Step 1:** Run `pnpm test && pnpm typecheck && pnpm build`. Expected: all pass. Paste the summary lines.
- [ ] **Step 2:** Confirm the target DB with Jaden. With approval, run `npx tsx scripts/backfill-legislator-links.ts --dry-run`, show Jaden the totals and unresolved list, then run it without `--dry-run`.
- [ ] **Step 3:** Spot-check in the app: one known introducer and one known chair return the expected bills.
- [ ] **Step 4:** Report to Jaden: counts written, unresolved tokens, and the follow-up for the scraper service (port `resolveIntroducers` and `currentCommitteeStep`, pass `src/lib/__tests__/fixtures/legislator-links.json`, write both fields in the bill/status transaction).

## Deferred (not in this plan)

- The per-card "In AGR: Lee chairs" line. The spec lets the builder defer it, and it's a small follow-up once the filter is in use.
- Scraper-service changes. That's another repo, and Task 10 Step 4 hands it off.
