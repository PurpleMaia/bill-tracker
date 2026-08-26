# 2027 User-Testing Simulation — Design

**Date:** 2026-08-26
**Status:** Approved for implementation
**Branch context:** `user-testing-sim` (do NOT merge to `main`; this is a test-env-only setup)

## Goal

Set up a self-contained simulation of a **2027 legislative session** so that
external user-testers can exercise the full bill-tracker flow against realistic
but fake data, without touching real bills. The simulation runs on the **full
application pointed at a dev database/deployment** — isolation is provided by the
separate database, not by any in-app flag.

## Tester profile & flow

Testers are **public users** (no tenant / no org membership). A freshly
self-registered account has zero memberships, so `activeTenant` resolves to
`null` and `tenantId` is `undefined` throughout the app. The flow under test:

1. **Register** a new account (self-service; registration itself is part of the test).
2. **Search** and discover 2027 bills.
3. **Track / untrack** bills (personal adoption; `user_bills.tenant_id = NULL`).
4. **Organize** them on the personal board, starting from an **empty board**.
5. **Draft / submit / export testimony** on tracked bills.

**Explicitly out of scope:** tags (tenant-scoped; public users have no tag
scope — dropped from the test), kanban-status pre-population, any `is_simulation`
schema column, and any registration/tenant-join changes.

## Why this is mostly a seeding problem

Verified against the codebase:

- **Public board** — `getUserTrackedBills` (`src/db/queries/bills-read.ts:144-161`)
  is keyed by `user_id`; the `tenant_id` clause is skipped when `tenantId` is
  undefined, and there is **no `food_related` predicate**. So a public user's
  personal board shows every bill they track. (The `food_related = true` gate at
  `bills-read.ts:41` is only in `getAllTrackedBills`'s anonymous/aggregate branch.)
- **Tracking** — `trackBill` / `trackBillById` (`src/db/queries/bills-write.ts:221, 322`)
  write `tenant_id: tenantId ?? null` with no tenant guard. Public tracking works.
- **Testimony** — stored in the `testimonies` table (`tenant_id` nullable,
  migration `000024`). Actions require only `requireSession`; membership is
  enforced **only** when a `tenantId` is passed (`src/app/actions/testimony.ts:31-33`),
  which a public user never does. Draft/submit/export all work tenant-less.

So the only real work is: **seed discoverable 2027 bills, surface the year in
the UI, and keep testimony deadlines open.**

## The one gotcha: testimony deadlines are not year-aware

`SESSION_DEADLINES` (`src/lib/testimony/session-deadlines.ts:16-18`) is a single
module-level constant hardcoded to the **2026** calendar (or the demo file when
`NEXT_PUBLIC_DEMO_DEADLINES=1`). `getTestimonyEligibility`
(`src/lib/testimony/testimony-eligibility.ts:37-74`) never looks at the bill's
`year` — it compares `today` against `final_decking_*`. With `today` past the
2026 deadlines, eligibility returns `{ allowed: false }` for every bill and the
"Write Testimony" action is closed everywhere.

**Decision:** use the existing **`NEXT_PUBLIC_DEMO_DEADLINES=1`** mechanism. The
demo calendar (`src/data/session-deadlines-demo.json`) has dates that sit just
ahead of "today", keeping testimony open. This means the bills' `year: 2027`
value is purely a **search-filter label**; it does not drive eligibility. No new
per-year data file is created and no year-aware refactor is done.

## Components to build

### 1. Seed script — `scripts/seed-sim-2027.ts`

Clone the structure of `scripts/seed-jaden-org-showcase.ts`. For each of ~10–15
hand-authored bills:

- `year: 2027`
- `bill_url: 'https://dummy.test/sim-2027/<slug>'` — the prefix is the ONLY thing
  the undo script keys on, guaranteeing real data is never touched.
- `bill_number` in a reserved range **HB/SB 98xx** (avoids collision with real
  measures and with the other seed sets, which use 97xx/99xx — see the range note
  in `seed-jaden-org-showcase.ts`).
- `food_related: true`
- Realistic `bill_title`, `description`, `bill_status`, `ai_status`, `introducer`,
  `committee_assignment`, `current_status_string`.
- **No `user_bills` and no `org_bills` rows** — bills exist only to be discovered
  in search, so every tester starts from an empty board.

Wrap all inserts in a single `db.transaction()`. Use `onConflict` on `bill_url`
for idempotency so the script can be re-run.

### 2. Undo script — `scripts/undo-sim-2027.ts`

Deletes `WHERE bill_url LIKE 'https://dummy.test/sim-2027/%'`. Prefix-scoped and
safe. Paired with the seed script, mirroring the existing seed/undo convention.

### 3. Surface 2027 in the UI year lists (3 edits)

- `src/lib/bills/search-params.ts:27` — add `2027` to `DEFAULT_FILTERS.years`
  (so search defaults to showing the 2027 session).
- `src/components/search/search-filter-rail.tsx:20` — add `2027` to `YEARS`.
- `src/components/search/bill-search-view.tsx:24` — add `2027` to `SESSION_YEARS`.

### 4. Deadlines: demo flag + consistent demo calendar everywhere

- Set `NEXT_PUBLIC_DEMO_DEADLINES=1` in the dev deployment's env. (Build-time
  inlined — restart the dev server after setting it.)
- Repoint the **three files that import the 2026 calendar directly** to use the
  demo-aware `SESSION_DEADLINES` export instead, so demo dates show consistently
  (including in the "why did this bill already die" derivation). This
  **deliberately overrides** the historical-fact note in `bill-details-dialog.tsx:49-50`
  — acceptable because this is a test-env-only branch; it must not merge to `main`.

  Files and usages to change:
  - `src/components/kanban/dead-bill-info-popover.tsx` — import at line 15;
    usage at line 56 (`deadlinesJson as SessionDeadlines`).
  - `src/components/testimony/testimonies-sidebar.tsx` — import at line 6;
    usages at lines 68, 71, 128.
  - `src/components/kanban/bill-details-dialog.tsx` — import at line 51; usage at
    line 201. (Line 53 already imports `SESSION_DEADLINES`; after the change the
    direct 2026 import is removed and line 201 uses `SESSION_DEADLINES`.)

  Mechanical swap in each: remove `import deadlinesJson from '@/data/session-deadlines-2026.json'`,
  add/keep `import { SESSION_DEADLINES } from '@/lib/testimony/session-deadlines'`,
  and replace each `deadlinesJson as SessionDeadlines` reference with
  `SESSION_DEADLINES`.

## Out of scope (explicit)

- No `bills.is_simulation` column or any schema migration.
- No simulation tenant / org, and no changes to the registration or
  invite/tenant-join flow.
- No tags in the test (public users have no tag scope).
- No pre-tracked bills / pre-populated kanban columns.
- No `session-deadlines-2027.json` and no year-aware eligibility refactor
  (superseded by the demo-flag decision).

## Isolation & safety guarantees

- Real bills are never modified: all writes are new rows under the
  `https://dummy.test/sim-2027/` prefix; undo is prefix-scoped.
- Runs against a **dev database/deployment**; production is a different DB.
- The deadline-import changes are UI-only and confined to this branch.

## Testing / verification

- `npm run typecheck` and `npm run build` (the build catches `'use server'` and
  import issues typecheck misses).
- `npm test` (pure-logic suites; no new pure logic here, but must stay green).
- Manual: run `npx tsx scripts/seed-sim-2027.ts` against the dev DB, register a
  fresh public account, confirm 2027 bills appear in search under the 2027 filter,
  track one, confirm it lands on the personal board, open it, confirm the
  "Write Testimony" action is available, draft + export. Then run
  `npx tsx scripts/undo-sim-2027.ts` and confirm the sim bills are gone.
