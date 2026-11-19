# Multiple Testimonies per Bill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user keep one testimony per hearing round of a bill (House/Senate committee, conference) and switch between them in the writer and on the Your Testimonies card.

**Architecture:** Drop `UNIQUE (user_id, bill_id)` on `testimonies`, add `chamber` + `committee` columns with a per-round expression unique index. A pure module derives a bill's current round and its label. Queries/actions/routes/data-client gain id-keyed operations; the bill-keyed legacy ones stay and act on the newest row. The writer takes `?t=<id>` and gets a round dropdown; the card groups testimonies by bill with round pills.

**Tech Stack:** Next.js 15, TypeScript, Kysely/Postgres, Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-18-multiple-testimonies-design.md`

## Global Constraints

- `db/queries/*` is not `'use server'`; every id-keyed query filters by `user_id` (ownership).
- `'use server'` files export only async functions.
- Client code calls `data.testimony.*`, never raw `fetch`; each new op has identical `action` and `fetch` arms registered in `defineClient`.
- Do not delete the old bill-keyed routes/actions/data-client ops.
- Tests are pure unit tests in `src/lib/__tests__/` (flat), no DB.
- No left-edge accent strips; state shown with chips/dots.
- Verify each task with `pnpm typecheck` and `pnpm test`; final task also `pnpm build`.
- Commit prefixes `feat:`/`fix:`/`refactor:`; no `Co-Authored-By` lines (CLAUDE.md overrides).

## Review Focus

- Legacy rows (chamber and committee both null) must still open, save, submit, delete, and show as "Earlier testimony" — Task 1 tests the label; Task 3 legacy functions update the newest row instead of inserting a duplicate.
- Opening the writer twice quickly (two tabs) must not create two rows for the same round — `createTestimonyForRound` returns the existing row on unique violation (Task 3).
- A bill with no current round derivable (no referral, `unassigned` status) still lets the user create a testimony — round becomes `{chamber: <origin or null>, committee: null}` (Task 1 test).
- Switching rounds in the writer with unsaved edits must save the edits to the *old* testimony, not the new one — Task 5 flushes before `router.replace`, and `performSave` captures the id at call time.
- Deleting one round on the card must remove only that testimony from the cache, not the whole bill — `removeItem(testimonyId)` (Task 6).

---

### Task 1: Pure round derivation and grouping

**Files:**
- Create: `src/lib/testimony/testimony-round.ts`
- Test: `src/lib/__tests__/testimony-round.test.ts`

**Interfaces:**
- Consumes: `currentCommitteeStep` from `@/lib/testimony/committees`.
- Produces:
  - `type TestimonyChamber = 'house' | 'senate' | 'conference'`
  - `interface TestimonyRound { chamber: TestimonyChamber | null; committee: string | null }`
  - `originChamber(billNumber: string): 'house' | 'senate' | null` — `S…` → senate, `H…` → house.
  - `currentTestimonyRound(bill: { billNumber: string; billStatus: string | null; currentCommittee: string[] | null; committeeAssignment: string | null; updates?: { statustext: string }[] | null; dead: boolean }): TestimonyRound`
  - `sameRound(a: TestimonyRound, b: TestimonyRound): boolean` — null-equal, committee compared upper-case.
  - `roundLabel(round: TestimonyRound): string`
  - `groupByBill<T extends { billId: string }>(items: T[]): { billId: string; items: T[] }[]` — keeps first-seen bill order and item order.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { currentTestimonyRound, roundLabel, sameRound, groupByBill, originChamber } from '@/lib/testimony/testimony-round';

const base = { committeeAssignment: 'AGR, FIN', updates: [], dead: false, currentCommittee: null };

describe('currentTestimonyRound', () => {
  it('origin chamber before crossover', () => {
    expect(currentTestimonyRound({ ...base, billNumber: 'HB123', billStatus: 'scheduled1', currentCommittee: ['AGR'] }))
      .toEqual({ chamber: 'house', committee: 'AGR' });
  });
  it('flips chamber on crossover statuses', () => {
    expect(currentTestimonyRound({ ...base, billNumber: 'HB123', billStatus: 'crossoverScheduled1', currentCommittee: ['AGL', 'WTL'] }))
      .toEqual({ chamber: 'senate', committee: 'AGL/WTL' });
  });
  it('conference has no committee', () => {
    expect(currentTestimonyRound({ ...base, billNumber: 'SB9', billStatus: 'conferenceScheduled' }))
      .toEqual({ chamber: 'conference', committee: null });
  });
  it('falls back to live committee step when current_committee empty', () => {
    expect(currentTestimonyRound({ ...base, billNumber: 'SB9', billStatus: 'introduced' }))
      .toEqual({ chamber: 'senate', committee: 'AGR' });
  });
  it('no referral → committee null', () => {
    expect(currentTestimonyRound({ ...base, committeeAssignment: null, billNumber: 'SB9', billStatus: 'unassigned' }))
      .toEqual({ chamber: 'senate', committee: null });
  });
});

describe('roundLabel', () => {
  it('labels', () => {
    expect(roundLabel({ chamber: 'house', committee: 'AGR' })).toBe('House · AGR');
    expect(roundLabel({ chamber: 'senate', committee: null })).toBe('Senate');
    expect(roundLabel({ chamber: 'conference', committee: null })).toBe('Conference');
    expect(roundLabel({ chamber: null, committee: null })).toBe('Earlier testimony');
  });
});

it('sameRound treats nulls as equal and ignores case', () => {
  expect(sameRound({ chamber: null, committee: null }, { chamber: null, committee: null })).toBe(true);
  expect(sameRound({ chamber: 'house', committee: 'agr' }, { chamber: 'house', committee: 'AGR' })).toBe(true);
  expect(sameRound({ chamber: 'house', committee: 'AGR' }, { chamber: 'senate', committee: 'AGR' })).toBe(false);
});

it('groupByBill keeps order', () => {
  const g = groupByBill([{ billId: 'a', n: 1 }, { billId: 'b', n: 2 }, { billId: 'a', n: 3 }]);
  expect(g.map((x) => [x.billId, x.items.map((i) => i.n)])).toEqual([['a', [1, 3]], ['b', [2]]]);
});

it('originChamber', () => {
  expect(originChamber('SB 12')).toBe('senate');
  expect(originChamber('HCR5')).toBe('house');
  expect(originChamber('')).toBe(null);
});
```

- [ ] **Step 2:** `pnpm vitest run src/lib/__tests__/testimony-round.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement. Chamber: `conference*` → conference; `crossover*` → opposite of origin; else origin. Committee: null for conference; `currentCommittee` joined by `/` when non-empty; else `currentCommitteeStep({...}).join('/')` or null.
- [ ] **Step 4:** Re-run → PASS; `pnpm typecheck` clean.
- [ ] **Step 5:** `git commit -m "feat: derive testimony hearing round from bill state"`

### Task 2: Migration 000036

**Files:**
- Create: `src/db/migrations/000036_testimony_rounds.up.sql`, `src/db/migrations/000036_testimony_rounds.down.sql`
- Modify: `src/db/types.ts` (`Testimonies`: add `chamber: string | null; committee: string | null;`)

- [ ] **Step 1: up.sql**

```sql
ALTER TABLE testimonies DROP CONSTRAINT IF EXISTS testimonies_user_id_bill_id_key;
ALTER TABLE testimonies
  ADD COLUMN IF NOT EXISTS chamber text CHECK (chamber IN ('house', 'senate', 'conference')),
  ADD COLUMN IF NOT EXISTS committee text;
CREATE UNIQUE INDEX IF NOT EXISTS testimonies_user_bill_round_key
  ON testimonies (user_id, bill_id, coalesce(chamber, ''), coalesce(committee, ''));
CREATE INDEX IF NOT EXISTS idx_testimonies_user_bill ON testimonies (user_id, bill_id);
```

- [ ] **Step 2: down.sql** — delete all but the newest `updated_at` (tie-break `id`) per `(user_id, bill_id)`; drop both indexes and both columns; `ADD CONSTRAINT testimonies_user_id_bill_id_key UNIQUE (user_id, bill_id)`.
- [ ] **Step 3:** Confirm the constraint name first: `psql "$DATABASE_URL" -c "\d testimonies"` shows `testimonies_user_id_bill_id_key`. Then `pnpm migrate:up`, `pnpm migrate:down`, `pnpm migrate:up` all succeed.
- [ ] **Step 4:** `pnpm typecheck` — expect errors only from Task 3 code paths not yet updated (none expected since columns are nullable).
- [ ] **Step 5:** `git commit -m "feat: allow one testimony per hearing round (migration 000036)"`

### Task 3: Queries and types

**Files:**
- Modify: `src/types/testimony.ts`, `src/db/queries/testimony.ts`

**Interfaces:**
- Consumes: Task 1 (`TestimonyRound`, `currentTestimonyRound`, `roundLabel`, `sameRound`).
- Produces (types):
  - `TestimonyDraft` gains `id: string; chamber: TestimonyChamber | null; committee: string | null; label: string`.
  - `TestimonyListItem` gains `id: string; chamber; committee; label` (same types).
  - `TestimonyUpdateInput = Omit<TestimonyDraftInput, 'billId'>`.
  - `TestimonyStatus` unchanged shape (one per bill).
- Produces (queries, all filter `user_id = userId`):
  - `getTestimonyById(userId, testimonyId): Promise<TestimonyDraft | null>`
  - `listBillTestimonies(userId, billId): Promise<TestimonyDraft[]>` — newest `updated_at` first.
  - `createTestimonyForCurrentRound(userId, billId, opts: { tenantId?: string | null; copyFromId?: string | null; authorName?: string }): Promise<TestimonyDraft>` — loads bill (`bill_number, bill_status, current_committee, committee_assignment, dead`) + its status_updates, computes round; if a row for that round exists returns it; else inserts (`submitted_at: null`, header+content copied from `copyFromId` when it's the user's own, else `authorName`); on unique violation (`code === '23505'`) re-select and return the existing one.
  - `updateTestimony(userId, testimonyId, input: TestimonyUpdateInput): Promise<TestimonyDraft>` — throws `ApiError(404)` when no row updated.
  - `markTestimonySubmittedById(userId, testimonyId): Promise<TestimonyDraft>` (404 when missing)
  - `deleteTestimonyById(userId, testimonyId): Promise<void>`
  - Legacy `getTestimonyDraft`/`upsertTestimonyDraft`/`markTestimonySubmitted`/`deleteTestimony` (bill-keyed) keep their signatures: get/update/mark the newest row for the bill; when none exists, upsert/mark create via `createTestimonyForCurrentRound`; delete removes all of the user's rows for the bill. Remove the `onConflict(['user_id','bill_id'])` usages (the constraint no longer exists).
  - `listUserTestimonies`: one item per testimony with `id/chamber/committee/label`; same ordering.
  - `getTestimonyStatuses`: one entry per bill, `submitted = every row submitted`.
  - `listTestimonyProspects`: drop the `t.id is null` join; select `current_committee`, `dead`, then in JS exclude bills where the user has a testimony with `sameRound(row, currentTestimonyRound(bill))`. Needs status_updates per bill for the fallback — reuse `latestStatusTextByBillId` input shape (pass `[{statustext: latest}]`).

- [ ] **Step 1:** Update types; add a shared row→`TestimonyDraft` mapper (`toDraft(row)`) in `testimony.ts` used by every getter.
- [ ] **Step 2:** Implement the queries above.
- [ ] **Step 3:** `pnpm typecheck` → only errors are in callers fixed by Tasks 4–6 (record them); `pnpm test` PASS.
- [ ] **Step 4:** Manual DB check with `pnpm dev` not needed yet; smoke with a scratch tsx script in the scratchpad if desired.
- [ ] **Step 5:** `git commit -m "feat: id-keyed testimony queries with hearing rounds"`

### Task 4: Actions, routes, data-client

**Files:**
- Modify: `src/app/actions/testimony.ts`, `src/lib/data-client/testimony.client.ts`
- Create: `src/app/api/testimony/[testimonyId]/route.ts` (GET/PUT/PATCH/DELETE), `src/app/api/bills/[id]/testimonies/route.ts` (GET list, POST create)

**Interfaces:**
- Consumes: Task 3 queries.
- Produces data-client ops (both arms, identical signatures):
  - `data.testimony.getById(testimonyId: string): Promise<TestimonyDraft | null>`
  - `data.testimony.listForBill(billId: string): Promise<TestimonyDraft[]>`
  - `data.testimony.create(input: { billId: string; tenantId?: string | null; copyFromId?: string | null; authorName?: string }): Promise<TestimonyDraft>`
  - `data.testimony.update(testimonyId: string, input: TestimonyUpdateInput): Promise<TestimonyDraft>`
  - `data.testimony.markSubmittedById(testimonyId: string): Promise<TestimonyDraft>`
  - `data.testimony.removeById(testimonyId: string): Promise<void>`

- [ ] **Step 1:** Actions: `requireSession.fromAction()`, or `requireMembership.fromAction(tenantId)` when a `tenantId` is given (create/update) — same pattern as `saveTestimonyDraftAction`.
- [ ] **Step 2:** Routes mirror `src/app/api/bills/[id]/testimony/route.ts` style (guards, `error?.statusCode` mapping).
- [ ] **Step 3:** Fetch arms + `defineClient` registration.
- [ ] **Step 4:** `pnpm typecheck`, `pnpm test`, `pnpm build` (catches `'use server'` violations) all pass.
- [ ] **Step 5:** `git commit -m "feat: data-client ops for per-round testimonies"`

### Task 5: Writer round switcher

**Files:**
- Create: `src/components/testimony/testimony-round-switcher.tsx`
- Modify: `src/app/bills/[id]/testimony/page.tsx`, `src/components/testimony/testimony-submit-guide.tsx` (use `markSubmittedById(testimonyId)`; add `testimonyId` prop)

**Interfaces:**
- Consumes: Task 4 ops; Task 1 `currentTestimonyRound`, `sameRound`, `roundLabel`.
- Produces: `<TestimonyRoundSwitcher testimonies={TestimonyDraft[]} activeId={string} newRoundLabel={string | null} onSelect={(id) => void} onCreate={() => void} />` — a shadcn `DropdownMenu`; trigger shows active label + chevron; items show label + green dot (submitted) / blue dot (draft); separator + "New for {newRoundLabel}" when non-null.

- [ ] **Step 1:** Page load: `listForBill(billId)` with bill details. Pick `?t=` if it's in the list; else the testimony whose round `sameRound` the bill's current round; else the newest; if the list is empty, `create({ billId, tenantId, authorName: fullNameOrUsername(user) })` and `router.replace` to `?t=<id>`. Keep other search params (`returnTo`, `from`).
- [ ] **Step 2:** Replace `saveDraft` with `update(testimonyId, …)`; `performSave` reads the id from a `testimonyIdRef` captured at the start of the save.
- [ ] **Step 3:** Switching: clear the debounce timer, `await performSaveRef.current()` (wait for in-flight to finish), then `router.replace` with the new `t`; the load effect depends on `t` and re-hydrates (reset `hydrated`, `step` → 1, `submitted`).
- [ ] **Step 4:** Create new round: `create({ billId, tenantId, copyFromId: <newest testimony id> })` → switch to it; `invalidateTestimonies()`.
- [ ] **Step 5:** Render the switcher in the header next to the title (desktop) and under the title (mobile); hidden when there's one testimony and no new round.
- [ ] **Step 6:** `pnpm typecheck`, `pnpm test`; manual: two rounds switch, edits persist on each, `?t=` deep link works.
- [ ] **Step 7:** `git commit -m "feat: switch between hearing-round testimonies in the writer"`

### Task 6: Your Testimonies card pills

**Files:**
- Modify: `src/components/testimony/testimonies-view.tsx`, `src/hooks/use-testimonies.ts`

**Interfaces:**
- Consumes: Task 1 `groupByBill`; Task 4 `getById`, `removeById`.
- Produces: `removeItem(testimonyId: string)` (hook) — filters `item.id !== testimonyId`.

- [ ] **Step 1:** In `FilteredList`/`TestimonyCardList`, group decorated drafts and submitted (each section separately) with `groupByBill`; render one `TestimonyCard` per group, keyed by `billId`.
- [ ] **Step 2:** `TestimonyCard` takes `entries: DecoratedTestimony[]`, holds `selectedId` (default `entries[0].item.id`, the newest); when `entries.length > 1` renders a row of pills (`roundLabel` + check icon when submitted) above the excerpt, styled like `PositionBadge` with a selected ring. All existing per-testimony content reads from the selected entry; the link is `/bills/${billId}/testimony?from=testimonies&t=${id}`.
- [ ] **Step 3:** `TestimonyCardMenu` uses `getById(item.id)` for copy and `removeById(item.id)` for delete; delete dialog copy names the round when the card has several ("Your House · AGR draft for HB123…").
- [ ] **Step 4:** Hook: `removeItem` by testimony id.
- [ ] **Step 5:** `pnpm typecheck`, `pnpm test`, `pnpm build`; manual at desktop and phone widths.
- [ ] **Step 6:** `git commit -m "feat: round pills on Your Testimonies cards"`
