# Refactor Audit — September 2026

> A read-only audit of the codebase for a refactor/cleanup PR series. Every
> finding below was verified by reading the cited code (not inferred from names).
> Nothing here has been changed — this is the plan, grouped into independently
> shippable PRs and ranked by impact ÷ risk.
>
> **Scope note:** the docs cleanup that accompanied this audit already (a) removed
> 11 unused dependencies from `package.json` and restored the one
> (`@tanstack/react-query`) that had been over-deleted, and (b) rewrote
> `README.md`, `docs/db/schema.md`, `docs/architecture/ARCHITECTURE.md`, and
> `CLAUDE.md`. Those are done; this file covers the code/organization work that
> remains.

## How to read this

Findings are grouped into **PR-sized batches**. Each batch is independently
shippable and ordered so the highest-leverage, lowest-risk work comes first.
Estimated "LOC saved" is net removed lines (after adding any shared helper).

| PR | Theme | Risk | ~LOC saved | Confidence |
|----|-------|------|-----------|------------|
| A | Quick deletions & dead code | Very low | ~230 files/lines | High |
| B | Repo hygiene: 54 MB binary, historical scripts | Low | 54 MB + ~1.5k lines | High (needs a team call) |
| C | Shared HTTP helper for the data-client | Low | ~150–180 | High |
| D | Route/action error-handling wrapper | Medium | ~190–250 | High |
| E | `<ConfirmDialog>` + shared UI helpers | Low | ~120–170 | High |
| F | Kill `(db as any)` / `as any` via real types | Low | (safety, not LOC) | High |
| G | Split the four god-file components | Medium | (structure, not LOC) | High |
| H | Contain the two intrinsic-complexity hotspots | Medium | (safety) | Medium |

---

## PR A — Quick deletions & dead code (very low risk)

Pure removals; git history preserves everything. Verified zero-import / identical.

1. **Delete `src/components/placeholder/placeholder-page.tsx`** and its now-empty
   directory. Grep confirms zero imports of `PlaceholderPage` anywhere in `src/`.
   (~24 lines)
2. **Delete the four byte-identical macOS copy artifacts** in
   `scripts/js-migrations/` (each `diff`-identical to its original):
   `create-supervisor-system 2.js`, `create-supervisor-user 2.js`,
   `list-all-users 2.js`, `merge-intern-into-user 2.js`. (~180 lines)
3. **Delete commented-out code blocks** left inline (git preserves them):
   - `src/components/kanban/kanban-board.tsx` — broken commented `useState` (L57)
     + three `//setHighlightedBillId(...)` calls (L203, L225, L229).
   - `src/components/kanban/bill-details-dialog.tsx:578–603` — ~25-line commented
     "Change Status" block marked `TEMPORARILY DISABLED`.
   - `src/components/auth/login-dialog.tsx` — commented OAuth block + import
     (`TEMPORARILY DISABLED`, ~L19–20, L253+).
   - `src/components/admin/admin-dashboard.tsx:32` (commented import), `:480`
     (commented state).
   - `src/hooks/contexts/bills-context.tsx` — commented `updateBillNickname` in
     three spots (L48, L349, L388).
   - `src/components/kanban/kanban-header.tsx` (L9, L52), `kanban-card.tsx:529–531`,
     `src/db/kysely/client.ts:10–11` (commented connection strings).

   > If any `TEMPORARILY DISABLED` feature is genuinely returning, gate it behind
   > a feature flag instead of a comment.

4. **Fix `docs/db/migration-guide.md`** — it says migrations live in
   `db/migrations/` in **5 places** (L44, L110, L115, L120, L125); the real path
   is `src/db/migrations/`. (Doc-only; the shell-script section is correct.)

**Also worth doing here (team call):** the ~28 commented-out long-form column
definitions in `src/lib/bills/kanban-columns.ts` (L7–48, L155). They double as
inline documentation of each column's legislative meaning — remove for less
noise, or keep as docs. At minimum drop the fully-redundant commented
`unassigned` entries.

---

## PR B — Repo hygiene: large binary & historical scripts (low risk, needs a decision)

1. **Un-track `bin/migrate` — a 54 MB binary committed to the repo.** Verified:
   `git ls-files` shows `bin/migrate` (54,001,816 bytes) is tracked and
   `.gitignore` does not exclude it. It's the golang-migrate CLI the
   `scripts/migrations/*.sh` wrappers invoke. Recommend gitignoring it and
   documenting `brew install golang-migrate` (already covered in
   `migration-guide.md`) or a download step. **This is the single biggest size
   win in the repo.** Removing it from history (e.g. `git filter-repo`) is a
   separate, coordinated action — flag for the team.
2. **Archive `scripts/js-migrations/` (35 one-off JS files).** Not referenced by
   `package.json` (real migrations are golang-migrate `.sql` + shell wrappers).
   Contents are superseded point-in-time ops (`setup-*-tables.js`,
   `add-*-columns.js`) and throwaway probes (`check-*.js`, `list-users.js`,
   `fix-password-hash.js`, `test-email-sending.js`). Move to an `archive/` dir or
   delete (git retains history). Biggest cleanup by file count.
3. **Archive expired demo/test seeders** once their event is over — each has a
   matching `undo-` (the pairing is a good maintained pattern, so keep the
   pattern, archive the finished instances): `seed-jaden-org-showcase`,
   `seed-jaden-org-enacted-real`, `seed-sim-2027`, `seed-dummy-column-bills`,
   `seed-versions-reports-demo`. **Keep** genuinely-maintained tooling:
   `check-bill-dead.ts`, `reclassify-dead-bills.ts`, `update-dead-flags.ts`,
   `parse-session-calendar.ts`, `export-csv.ts`, `scripts/evaluate/*`.
4. **Move non-runtime data out of `src/data/`.** `src/data/v1.json` (an OpenAPI
   spec) has zero code imports — it's referenced only as prose by
   `docs/capitol-api-reference.md`. Move it next to that doc so `src/data/` holds
   only imported runtime JSON (`session-deadlines-2026.json`,
   `session-deadlines-demo.json`). Don't delete (the doc points at it).
5. **Archive `docs/vibecode-blueprint.md`** — the original prototype-scaffolding
   prompt, fully superseded by the current architecture.

---

## PR C — Shared HTTP helper for the data-client (low risk, high leverage)

**Finding:** 34 near-identical fetch-and-unwrap blocks across 9
`src/lib/data-client/*.client.ts` files. Every `*Fetch` repeats:

```ts
const res = await fetch(url, opts);
if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to …'); }
return res.json();  // or (data.<key> ?? [])
```

Counts: `bills.client.ts` ×5, `boards.client.ts` ×11, `testimony.client.ts` ×7,
`proposals.client.ts` ×4, `summaries.client.ts` ×2, `preferences.client.ts` ×2,
`access.client.ts` ×2, `committees.client.ts` ×1, `legislators.client.ts` ×1.

**Fix:** add `getJson<T>(url, { errorLabel?, pick? })` and
`sendJson<T>(url, method, body, opts?)` helpers (a new `data-client/http.ts` or
in `transport.ts`) that do fetch → `if (!res.ok) throw` → parse. Each fetch arm
collapses to one or two lines. **~150–180 LOC saved**, and the error-message
convention lives in one place.

---

## PR D — Route/action error-handling wrapper (medium risk, high leverage)

Three related duplications, all solved by extracting the mapper that
`src/lib/core/errors.ts` **already contains but commented out**:

1. **API route try/catch tail** — ~48 identical blocks across the 42 routes
   (65 total `catch (error`, 61 manual `status: 500`). Each guarded handler ends
   with the same `if (error?.statusCode) … else console.error + 500`.
2. **`admin.ts` `ActionResult` envelope** — ~13 functions in
   `src/app/actions/admin.ts` repeat `try { verifyAdminAccess; …; return {success:true} } catch { return {success:false} }` (38 `success:false` returns in that one file; the other 9 action files have **zero** — they throw `ApiError` and let the data-client unwrap). Extract `runAdminAction(tenantId, label, fn)` so admin.ts matches the throw-based convention.
3. **Inconsistent `ApiError` mapping (a correctness bug, not just dup):**
   - Guarded routes duck-type on `error?.statusCode`.
   - `src/app/api/auth/login/route.ts:96` uses `error instanceof ApiError` (only route that does).
   - `src/app/api/auth/register/route.ts:102–104` does **neither** — returns a raw message with a blanket 500, so an `ApiError`'s intended status is lost.

**Fix:** export `toErrorResponse(error, fallbackMsg?)` from `errors.ts` (un-comment
+ make `instanceof ApiError`-aware) and optionally a `withRoute(handler)` wrapper.
Standardizes mapping and removes the tail from every handler. **~190–250 LOC
saved** and fixes the register-route status bug.

---

## PR E — `<ConfirmDialog>` + shared UI helpers (low risk)

1. **`<ConfirmDialog>`** — the same `AlertDialog` confirm scaffold appears ~7×
   across 4 components, including **byte-identical intra-file copies**:
   - `kanban-card.tsx` — "Remove Bill from Board?" **twice** (L411–430 vs L696–715, identical bodies), plus "Track this bill?" (L620–666).
   - `admin-dashboard.tsx` — "Remove Bill from User" **twice** (~L663–680 vs L949–966), plus "Archive Account" (L443–457).
   - `testimonies-view.tsx:749–775`, `pending-invites-section.tsx` — one each.

   Extract `<ConfirmDialog open onOpenChange title description confirmLabel destructive loading onConfirm trigger?>`. **~90–130 LOC saved.**
2. **`getClientIp` — delete 4 hand-rolled copies**, import the existing
   `@/lib/core/client-ip`. Local re-implementations in
   `api/auth/login/route.ts:16–34`, `api/auth/register/route.ts:16–22`,
   `api/auth/resend-verification/route.ts:8`, `api/invites/validate/route.ts:7`.
   (~40 LOC, removes drift risk in security-relevant IP parsing.)
3. **`roleBadgeColor(role)`** — two near-identical defs with the same literal
   Tailwind strings: `admin-dashboard.tsx:248–259` and
   `assign-multiple-bills-dialog.tsx:155–162`. Extract one (must live under
   `src/components/` per the Tailwind-scanning caveat already noted in
   `status-chip-classes.ts`). (~10–15 LOC.)
4. **Status→phase color** — `getColumnPhaseBg` in `kanban-column.tsx:23–35` and
   `getStatusPhase`/`PHASE_CHIP_CLASSES` in `search/status-chip-classes.ts:33–64`
   are a **self-documented** copy kept in sync by hand (the latter's header says
   it "MIRRORS getColumnPhaseBg verbatim"). Extract the phase classification +
   the three hex values into one shared module. (~15–25 LOC; main value is
   removing the manual-sync hazard.)
5. **`formatShortDate` / `formatDeadline`** — ~10 inline
   `new Date(x).toLocaleDateString('en-US', {...})` call sites (several with the
   same `+ 'T00:00:00'` midnight-normalize): `kanban-spreadsheet.tsx:330`,
   `kanban-card.tsx:569`, `dead-bill-info-popover.tsx:66`,
   `testimonies-sidebar.tsx:136`, `dead-bill.ts:203`, a local `formatDate` in
   `testimonies-view.tsx:913–915`, etc. Add helpers to `lib/core/utils.ts` (which
   already owns date helpers). Lower priority. (~15–25 LOC.)
6. **`groupParentChild(rows, {...})`** — the same Map-based parent/child
   aggregation loop appears 3× in `src/db/queries/admin.ts`
   (`selectAllInterns` L153–181, `selectAllSupervisors` L228–251,
   `selectAllInternBills` L296–320); lighter variants in `tenants.ts:243`,
   `committee-chairs.ts:66`. Extract one generic helper. (~40–55 LOC.)

---

## PR F — Kill `(db as any)` / `as any` via real types (low risk, safety win)

Escape-hatch census across `src/` (non-test): **`as any` ×11** (of which
**`(db as any)` ×7**), `@ts-ignore` ×0, `@ts-expect-error` ×0, `eslint-disable`
×5 (all benign/localized). No blanket suppressions — good baseline.

The 7 `(db as any)` casts defeat the typed query builder on tables the generated
schema apparently doesn't declare:

- `src/app/api/bills/nickname/route.ts` — **five** casts (L24, L40, L49, L57,
  L66); every write to `user_bill_preferences` is unchecked. **Worst offender.**
- `src/app/api/users/check-adoption/route.ts:26`.
- `src/lib/auth/session.ts:147` — the code even documents the workaround
  ("Using snake_case because we're using `(db as any)`…").

**Fix:** ensure `user_bill_preferences` (and any other missing tables) are in the
Kysely `DB` interface — regenerate with `pnpm codegen` — then delete all 7 casts.

Plus: **add `proposalId?: string` to the `TempBill` type.** Today
`src/hooks/bills/use-human-proposals.ts:155` and `:220` read
`(tb as any).proposalId` — and that invisible, untyped field is the discriminator
choosing between the LLM-accept path and the human-proposal path. Add the field
and extract one `isLlmProposal(tb, bill)` predicate used by both accept and
reject. (Removes 2 `as any` and a subtle, duplicated control-flow rule.)

---

## PR G — Split the four god-file components (medium risk, structure)

The 2026-06-02 DRY-cleanup was **half-executed**: `bills-context.tsx`
(867→424, now a thin coordinator delegating to `hooks/bills/*`), the `admin.ts`
action file (972→406), and `db/queries/admin.ts` (28 small fns) are **already
clean — leave them**. The remaining god files are all **UI components**:

| File | Lines | Problem | Split into |
|------|-------|---------|-----------|
| `components/admin/admin-dashboard.tsx` | 970 | 5 components + per-tab state + **copy-pasted `handleRemoveBill` (L482–503 ≡ L839–860)**; inline `await import()`; `alert()` instead of toast; `window.location.reload()` after mutations; `==` at L50 | one file per `*Tab` under `admin/tabs/`; a shared `useRemoveBillFromIntern()` hook |
| `components/kanban/bill-details-dialog.tsx` | 797 | one ~700-line component: fetch + 4 effects + direct write + ~60 lines of derivation + an **IIFE rendering two near-duplicate mobile/desktop trees** (L515–792); testimony CTA triplicated | `useBillDetails()` hook; pure `deriveBillDialogState()`; `<BillDialogDesktop>` / `<BillDialogMobile>` + shared `<BillTestimonyCTAs>` |
| `components/kanban/kanban-card.tsx` | 784 | hand-rolled tap-vs-drag gesture code (magic `10`/`500`/`700`) next to domain derivation; **Remove dialog duplicated (L411–430 ≡ L696–715)**; a hand-maintained 48-line `arePropsEqual` memo comparator (L734–782) | `useTapToOpen()` hook; `useCardTestimonyState()` shared with the dialog; one `<RemoveBillDialog>` |
| `components/kanban/kanban-board.tsx` | 604 | 4 interleaved concerns (rAF edge auto-pan physics, grouping, scroll nav, drag-persist) + **the entire ~55-line column tree duplicated** for the read-only vs drag branch (L464–514 ≡ L516–577) | `useEdgeAutoPan()` + `useColumnScroll()` hooks; pure `groupBillsByColumn()`; one `<BoardColumns enableDnd>` |

> `components/testimony/testimonies-view.tsx` (924) is large but **already
> well-decomposed** into ~14 small sub-components — lower priority than the four
> above. `components/ui/sidebar.tsx` (763) and `ui/chart.tsx` (365) are vendored
> shadcn/ui — leave them.

Common wins across these splits: remove ~4 duplicated blocks, move gesture/physics
code out of business logic, and make the mobile/desktop render paths share one
source.

---

## PR H — Contain the two intrinsic-complexity hotspots (medium risk)

These are genuinely hard problems — the goal is **containment and typing**, not a
rewrite:

1. **`searchBills()`** — `src/db/queries/bills-read.ts:588–777`. A ~190-line
   keyset-paginated full-text search built from raw `sql\`…\`` fragments;
   `applyFilters` (L621–638) is typed `<T extends { where: any }>` and reassigns
   `let out: any = qb`, discarding Kysely types, and every result row is
   `.map((r: any) => …)` (L724, L738, L764). Correctness rests on subtle SQL-type
   invariants explained only in comments (L646–649). **Fix:** extract
   `buildRankExpr`, `buildKeysetPredicate`, `applySearchFilters` as named,
   individually-tested helpers; type the row shape once (`SearchRow`) instead of
   `any` at every `.map`. Keep `searchBills` as an orchestrator.
2. **`bill-details-dialog.tsx` CTA rendering** (L384–489 desktop / L695–760
   mobile) — deeply nested ternaries mixing `user`, `testimonyEligibility.allowed`,
   `testimonyUrgent`, `testimonyCountdown`, `contactDisabled`, re-implemented for
   both layouts. **Fix (overlaps PR G):** extract `<WriteTestimonyButton>` and
   `<ContactLegislatorButton>` that each take derived state and internally decide
   login-prompt / enabled / disabled-with-reason.

Also here: `src/db/queries/bills-write.ts:96` carries a
`// THIS IS INEFFICIENT, TODO JUST FIND EXISTING BILL BY BILL ID` marker — a known
perf problem worth turning into a tracked issue.

---

## Cross-cutting observations

- **Logging noise:** ~124 `console.log` calls across `src/` (concentrated in
  `bills-read.ts` emoji-tagged per-query logs, `use-human-proposals.ts`,
  `bills-context.tsx`). No consistent convention. Introduce a tiny env-gated
  `logger` and strip the per-query fetch logs at minimum.
- **Duplicate role types:** `OrgRole` is declared verbatim in both
  `src/types/tenant.ts` (L2) and `src/db/types.ts` (L30); `SystemRole` (tenant) ≡
  `Sysrole` (db). Importers are split between the two. Pick the hand-authored
  `src/types/tenant.ts` as canonical and converge. (Regenerating `db/types.ts`
  will keep re-adding its copy — so either re-export or accept the generated one
  as canonical and delete the hand copy; decide once.)
- **Legacy `user.role` column** (typed at `db/types.ts:279`) is **still actively
  read/written** (`db/queries/admin.ts`, `access.ts`, `bill-assignment.ts`,
  `bills-read.ts`, e.g. `.where('role','=','supervisor')`). **Do not delete now** —
  track a migration onto `system_role`/`org_role`, then drop the column + field.
- **One-file component dirs:** `src/components/llm/` (only
  `llm-update-column-button.tsx`, used by `kanban/column-options-menu.tsx`) and
  `src/components/scraper/` could be folded into `src/components/kanban/` to
  co-locate the column tooling.

---

## Verified NOT problems (don't re-investigate)

- `src/lib/bills/derived-status.ts` (pure algorithm) vs
  `src/db/queries/derived-status.ts` (thin DB wrapper that imports it) — **not**
  duplicates; `diff` confirms only the persistence layer differs.
- `escapeHtml` exists in exactly one place (`services/email.ts:3`).
- All 3 `src/hooks/bills/*` hooks are used by `bills-context.tsx`.
- All 6 `src/services/*` have importers; the two `google-oauth` files
  (`services/google-oauth.ts` network wrapper vs `lib/auth/google-oauth.ts` pure
  helpers) are a deliberate, documented split.
- `testimony-export/{to-docx,to-pdf,download}.ts` are lazy-loaded via
  `await import()` in `testimony-export-step.tsx`.
- `admin-utils.ts` was already deleted in a prior refactor (only survives as
  historical comments).
- High-comment source files (`bills-read.ts`, `kanban-card.tsx`, …) are
  explanatory prose, not commented-out code.
