# Codebase Health Assessment — September 2026

> An extensive, **rated** audit of the Hawaiʻi Bill Tracker codebase focused on
> **efficiency** and **logic cleanliness**. Every finding below was verified by
> reading the cited code; the highest-severity items were re-confirmed by hand.
> This is a read-only assessment — **no code was changed.**
>
> Companion doc: [`refactor-audit-2026-09.md`](./refactor-audit-2026-09.md) covers
> duplication, god files, and file organization (the *structural* audit). This
> doc grades runtime efficiency, render performance, and logic correctness.

---

## Overall grade: **B−**  ("good, with a few sharp edges")

| Dimension | Grade | One-line verdict |
|-----------|:-----:|------------------|
| **Database / runtime efficiency** | **B−** | Excellent search/indexing/batching; pulled down by unbounded board queries, cache-bypassing refetches, and an uncapped serial scraper loop. |
| **Frontend / render efficiency** | **C+** | Well-built periphery (search, testimony store); the hot Kanban path has un-memoized context values, an unmemoized column, and a real hooks-order bug. |
| **Logic cleanliness & correctness** | **B** | Clean, legible, well-typed, thoughtfully edge-cased — held back by **two confirmed cross-tenant authorization bugs** in hand-rolled routes. |
| **Architecture & consistency** | **B+** | Strong patterns (data-client seam, guards, queries-as-SoT) — but partially adopted; the bugs live exactly where routes bypass the patterns. |
| **Testing & safety nets** | **C** | 54% of pure-logic modules unit-tested; **zero** DB/route/component tests, and the build ignores type/lint errors. |

**The through-line:** the *shared abstractions are excellent* — the search
query, the batched read fan-out, the index set, the pure-logic modules, the auth
guards, the memoized `BillsContext`. Nearly every problem worth fixing is in a
place that **bypasses** one of those abstractions (a route that hand-rolls auth,
a board read that predates the search pagination, a context that forgot to
`useMemo`). This is a healthy shape: the ceiling is high and the fixes are
localized, not architectural.

---

## Objective metrics (measured, not estimated)

| Metric | Value | Note |
|--------|------:|------|
| Source files (non-test) | 298 | `.ts` / `.tsx` under `src/` |
| Source LOC (non-test) | ~40,300 | |
| Test files / test LOC | 37 / ~5,400 | Vitest, pure logic only |
| Pure lib modules with a unit test | **31 / 57 (54%)** | Good for pure logic; nothing else tested |
| `console.log` in `src/` | **124** | No logging convention; noise in prod |
| `window.location.reload()` | 3 | Anti-pattern in a SPA (all in admin dashboard) |
| `as any` (of which `(db as any)`) | 11 (7) | Localized to 2 files + 2 discriminator casts |
| `@ts-ignore` / `@ts-expect-error` | **0** | Strong discipline |
| Loose `==` / `!=` | **0** | Strong discipline |
| Empty `catch {}` blocks | **0** | Every catch handles or re-throws |
| `React.memo` / `useMemo` / `useCallback` | 2 / 49 / 57 | Computations memoized; list *components* mostly not |
| Lazy `await import()` | 13 | Heavy export libs correctly code-split |

---

## 🔴 Priority-0 — Confirmed correctness / security bugs

These are **not** cleanliness nits — they are real defects verified by reading
the code. Fix before the cleanup work.

### P0-1. Cross-tenant proposal approval/rejection (privilege boundary break)

`findPendingProposalById(proposalId)` in `src/db/queries/proposals.ts:184-190`
filters **only** on `id` + `approval_status='pending'` — no `tenant_id`:

```ts
export async function findPendingProposalById(proposalId: string) {
  return db.selectFrom('pending_proposals').selectAll()
    .where('id', '=', proposalId)
    .where('approval_status', '=', 'pending')   // ← no tenant_id filter
    .executeTakeFirst();
}
```

Both `src/app/api/proposals/route.ts:111-130` and the hand-mirrored
`src/app/actions/proposals.ts` admin-gate on **the caller's own `tenantId`**,
then act on any proposal by id:

```ts
if (orgRole !== 'admin') return 403;              // admin of THEIR org — passes
const proposal = await findPendingProposalById(proposalId);   // not tenant-scoped
if (action === 'approve')
  await updateBillStatus(proposal.bill_id, proposal.proposed_status, tenantId);  // writes to caller's org
```

**Impact:** a tenant-A admin can approve/reject **tenant-B's** pending proposals
by id, and the approve path writes an `org_bills` row for the wrong org.
**Fix:** add `.where('tenant_id','=',tenantId)` to `findPendingProposalById` (or
assert `proposal.tenant_id === tenantId` after fetch) — **in both the route and
the mirrored action.**

### P0-2. Tags POST authorization confuses global role with tenant role

`src/app/api/bills/[id]/tags/route.ts:74` + `:89`:

```ts
if (user.role !== 'admin' && user.role !== 'supervisor') return 403;  // GLOBAL role
...
await validateMembership(user.id, tenantId);   // only checks membership, not org_role
```

It checks the caller's **global** `user.role`, then only that they're *a member*
of the tenant — never their **org_role in that tenant**. **Impact:** (a) an
org-*admin* of X whose global role is the default `'user'` is **wrongly
forbidden** from tagging their own org's bills; (b) the intended org-admin gate
isn't actually enforced. The GET arm just above (`:34`) correctly uses
membership-only (reads are fine); only POST's model is wrong. **Fix:** use
`requireAdmin.fromRequest(request, tenantId)` — the guard built for exactly this.

> **Root cause of both:** the migration to `@/lib/auth/auth-guards` is
> incomplete — ~10 routes still hand-roll `getSessionCookie → validateSession →
> validateMembership`. Routing them through the guards eliminates this whole bug
> class. (And note: `actions/*` files mirror `api/*` **by hand**, so each fix
> lands in two places — see the "mirror duplication" note below.)

---

## Dimension 1 — Database / runtime efficiency  →  **B−**

**Strengths (genuinely good, B+/A− work):**
- **`searchBills`** (`bills-read.ts:588-777`) is exemplary — keyset (cursor)
  pagination, GIN + trigram indexes matched to predicates, a single `DISTINCT ON`
  for latest-status with a comment explicitly rejecting the N+1 approach.
- **Batched read fan-out:** `getAdditionalBillData` (`bills-read.ts:239-268`)
  fetches status updates, tags, trackers, counts, and org statuses as **five
  `WHERE … IN (billIds)` queries**, not per-row. The opposite of N+1.
- **Index coverage** (migrations `000020`, `000031`) of hot FK/filter columns is
  thorough: `user_bills(user_id|bill_id|tenant_id,user_id)`,
  `status_updates(bill_id)`, `members(tenant_id,user_id)`, `bills(bill_status|year)`
  + partial indexes on `food_related`/`archived`/`dead`.
- **Connection pool** (`db/kysely/client.ts`) is a proper memoized singleton on
  `globalThis` (no pool-per-request), with `statement_timeout: 10000` as a
  backstop. A custom `RetryDriver` handles transient error codes.

**What pulls it down:**
- 🔴 **Unbounded board queries.** `getAllTrackedBills`, `getAllFoodRelatedBills`,
  `getUserTrackedBills` (`bills-read.ts:31, 84, 150`) have **no `LIMIT`** and back
  `GET /api/bills`. Bounded in practice today, but nothing enforces it and the
  public food-related view grows unbounded. `getBatchStatusUpdates`
  (`bills-read.ts:367`) then pulls *every* status_update for the whole board.
- 🔴 **The board bypasses the installed React Query cache.** `BillsContext`
  fetches via `useEffect` (`bills-context.tsx:249-289`) that clears and refetches
  on every dep change; React Query (5-min `staleTime`) is configured but only
  used by search/admin/track. Toggling view mode/archived triggers a full refetch
  with no dedupe — and `toggleViewMode` can double-fetch (imperative + effect).
- 🔴 **Uncapped serial scraper loop.** `update-column-button.tsx:33-58` awaits
  `scrapeForUpdates(bill.id)` **once per bill, serially**, each an external HTTP
  call with **no timeout/retry/abort** (`services/scraper.ts:17-21`). A 40-card
  column = 40 sequential remote scrapes (~40-120s). Contrast the LLM button,
  which correctly caps concurrency at 3 with `Promise.allSettled`.
- 🟡 **3× `window.location.reload()`** in `admin-dashboard.tsx` (`:492, :849, :889`)
  re-run the dashboard's heaviest aggregate queries after a single mutation.
- 🟡 **Acknowledged double-fetch** at `bills-write.ts:96` (`// THIS IS
  INEFFICIENT`) reads the same `bills` row twice; the LLM path re-reads
  `bill_status` it already had (`llm.ts:240` vs `:359`).
- 🟡 **Over-fetch:** board reads use `selectAll('b')` (pulls `description` +
  `search_vector`); a few existence checks `selectAll()` then test `.length`.

---

## Dimension 2 — Frontend / render efficiency  →  **C+** (leaning B−)

**Strengths:** the newer surfaces show real performance awareness — search uses a
React Query **infinite query** with `IntersectionObserver` pagination;
`useTestimonies` is a `useSyncExternalStore` module cache with `Promise.all`,
request-sequence guards, and event-based invalidation; **`BillsContext`'s value
is correctly `useMemo`'d** with accurate deps (the model to copy); the Kanban
auto-pan `requestAnimationFrame` loop is cleanly torn down; keys are stable
(`bill.id`) everywhere — **zero** index-as-key in dynamic lists.

**What pulls it down (all on the hot Kanban path):**
- 🔴 **`CardTagSelector` has a Rules-of-Hooks violation** (verified). A
  `useEffect` (`card-tag-selector.tsx:39`) sits **after** an early
  `if (!activeTenant) return null;` (`:32`). When `activeTenant` toggles, the
  hook count changes → React throws "Rendered fewer hooks than expected." It
  renders inside **every KanbanCard** (`kanban-card.tsx:348`). **This is a latent
  crash — fix first.** (Fix: move the early return below all hooks.)
- 🔴 **Un-memoized context values on the two busiest contexts.** `AuthContext`
  (`auth-context.tsx:242`) and `KanbanBoardContext` (`kanban-board-context.tsx:30`)
  pass **inline object literals** with no `useMemo` (Auth also redefines
  `login/logout/register` each render). Every provider render cascades to every
  consumer — on the board, every card. Typing in the search box re-renders the
  whole board subtree.
- 🔴 **`KanbanColumn` is not memoized** (`kanban-column.tsx:71`) and receives
  **fresh inline arrow callbacks** each board render (`kanban-board.tsx:496-498`),
  so all ~13-17 columns re-render on every keystroke/drag-hover.
- 🟡 **The 48-line hand-rolled `arePropsEqual`** card comparator
  (`kanban-card.tsx:734-782`) is a maintenance/staleness liability: it enumerates
  which `bill` fields matter and compares `tracked_by` only by `.length`, so a
  same-length tracker swap won't re-render. A single `bill.updated_at` comparison
  would be safer and self-maintaining.
- 🟡 **Per-card deadline/testimony math + `new Date()` run in render bodies**
  unmemoized (`kanban-card.tsx:140-148, 224-236`).
- 🟡 **tiptap eagerly imported** in `testimony-preview.tsx` (statically pulled by
  the export step) — could be `next/dynamic`. (Export libs `xlsx`/`pdfmake`/`docx`
  *are* correctly lazy.) The unused `ui/chart.tsx` still top-level-imports
  `recharts`.

---

## Dimension 3 — Logic cleanliness & correctness  →  **B**

**Strengths:** the pure-logic layer is clean, single-sourced, and tested.
`deriveBillStatus` (`derived-status.ts`) maps its documented 5-step algorithm
directly onto readable code and is unit-tested for empty/tie/unknown cases.
Timezone math is centralized and correct (`utils.ts` `todayHawaii` uses
`Pacific/Honolulu`, guards `isNaN`). Type hygiene is strong: **0** `@ts-ignore`,
**0** loose equality, **0** empty catches; `as any` confined to ~9 understood
sites. Even dense functions hoist decisions into named booleans. **Tenant-scoping
is the most carefully-reasoned area** — `untrackBill`/`removeBillFromOrg`/
`trackBillById` explicitly handle the `tenant_id IS NULL` legacy-row hazard with
comments; `tags.ts` filters `tenant_id` in every function.

**What pulls it down:**
- 🔴 **The two P0 authorization bugs above** (proposals cross-tenant; tags-POST
  role confusion) — both in hand-rolled routes.
- 🟡 **`(tb as any).proposalId` drives control flow** (`use-human-proposals.ts:155,
  220`). This untyped field is the discriminator choosing LLM-accept vs.
  human-proposal; a shape change silently routes every human proposal into the
  LLM branch. Duplicated verbatim in accept *and* reject. Fix: add
  `proposalId?: string` to `TempBill`, extract one `isLlmProposal()` predicate.
- 🟡 **Deferred-status derivation inconsistency** (`derived-status.ts:58` vs
  `:61-66`): the mode path can return `deferred1` verbatim while the median path
  collapses deferred→scheduled via `EXTENDED_INDEX`. Low impact (both map to the
  same simplified column) but the persisted detailed status diverges.
- 🟡 **Swallowed read errors return `[]`/`null`** across many queries — a
  transient DB error is indistinguishable from "no data." Deliberate for UI
  resilience, but a silent-miss class.

---

## Dimension 4 — Architecture & consistency  →  **B+**

The stated patterns are strong and mostly followed: the **data-client transport
seam** (one `data.*` API, action/fetch arms unwrapped in one place), **queries as
the single source of truth** (`db/queries/*`, mappers isolated), **auth guards**,
and clean pure/impure separation (`lib/` is DB-free). Consistency gaps, all of
which produced findings above:
- **Auth guards only partially adopted** — ~10 routes hand-roll the preamble; the
  two P0 bugs live there.
- **`actions/*` mirror `api/*` by hand** (`// Mirrors <route>` comments). The
  mirror discipline is accurate (verified: the proposals pair matches) — but it
  **doubles the surface area for every fix and every bug**. The cross-tenant
  proposal bug exists identically in both copies.
- **Board reads predate the search pagination** — same team, two eras of care.

---

## Dimension 5 — Testing & safety nets  →  **C**

- **54% of pure-logic modules** (31/57) have unit tests, and the ones that matter
  most (`derived-status`, `kanban-columns`, `dead-bill`, filters/search, version
  diff, testimony eligibility, validators) are covered — genuinely good for pure
  logic.
- **But there are zero** integration, route, or component tests. The DB query
  layer, the API routes, the auth guards, and every React component are untested
  — which is exactly where the P0 authorization bugs live. A single route test
  asserting "tenant-A admin cannot approve tenant-B's proposal" would have caught
  P0-1.
- **The build does not enforce types or lint** (`next.config.ts`
  `ignoreBuildErrors` + `ignoreDuringBuilds`), and `pnpm typecheck` currently
  reports pre-existing `implicit any` errors. A green build is not a safety net.

**Recommendation:** add a thin integration-test layer for auth/tenant-scoping on
the routes (highest risk, currently zero coverage), and run `pnpm typecheck` +
`pnpm lint` in CI as required checks.

---

## Suggested order of work

1. **Fix the P0 authorization bugs** (proposals tenant-scope; tags-POST guard) —
   correctness/security, small diffs, and fix each in the route **and** its
   mirrored action.
2. **Fix the `CardTagSelector` hooks violation** — latent crash, one-line move.
3. **`useMemo` the Auth & KanbanBoard context values; `React.memo` `KanbanColumn`**
   — biggest render win, low risk.
4. **Bound + cache the board reads** (keyset pagination like `searchBills`; move
   the board fetch into React Query) and **cap/parallelize the scraper loop**.
5. Then the structural cleanup in
   [`refactor-audit-2026-09.md`](./refactor-audit-2026-09.md) (dedup, god-file
   splits, dead code, the 54 MB `bin/migrate` binary).
6. **Add route-level integration tests** for auth/tenant-scoping and turn on
   typecheck/lint in CI.

---

## Verified strengths (so they don't get "refactored away")

- `searchBills` keyset pagination + the batched `getAdditionalBillData` fan-out.
- The migration index set (`000020`, `000031`) — matched to real predicates.
- The Kysely pool singleton + `RetryDriver` + `statement_timeout`.
- `BillsContext` value memoization; the search infinite-query; the `useTestimonies`
  external store with `Promise.all` + sequence guards.
- The pure-logic modules (`derived-status`, `utils`, `kanban-columns`, testimony/
  versions helpers) — single-sourced, DB-free, unit-tested.
- Tenant-scoping's deliberate `tenant_id IS NULL` handling in the tracking queries.
- Type hygiene: zero `@ts-ignore`, zero loose equality, zero empty catches.
