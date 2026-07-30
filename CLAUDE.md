# Food+ Bill Tracker — CLAUDE.md

## Project Overview

Food+ is a Next.js web app for tracking food-related legislation in Hawaii. It uses a multi-tenant architecture where organizations can manage their own bill tracking, statuses, tags, and team members independently.

## Tech Stack

- **Framework:** Next.js 15 (App Router, Turbopack)
- **Language:** TypeScript
- **Database:** PostgreSQL via Kysely (query builder, not ORM)
- **Auth:** Custom session-based auth (Lucia-compatible, cookie-based)
- **Email:** Resend
- **UI:** shadcn/ui + Tailwind CSS
- **Drag-and-drop:** @hello-pangea/dnd
- **Testing:** Vitest
- **AI:** Google Genkit for bill classification

## Commands

```bash
npm run dev          # Start dev server on port 9002
npm run build        # Production build
npm run test         # Run tests (vitest run)
npm run test:watch   # Watch mode
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm run migrate:up   # Run DB migrations
npm run migrate:down # Roll back last migration
```

## Architecture

### Directory Structure

```
src/
  app/
    api/            # API routes (REST). One transport arm of the data-client (see below).
    actions/        # Server actions ('use server'). The other transport arm + the live admin domain.
    register/       # Registration page (useSearchParams wrapped in Suspense)
    verify-email/   # Email verification page
  components/       # React components, grouped by area (admin/ auth/ kanban/ tags/ llm/ scraper/ main/ supervisor/ ui/)
  hooks/
    contexts/       # React contexts (auth-context, bills-context, kanban-board-context)
  lib/              # Pure utilities, validators, constants — NO database access
    data-client/    # Switchable transport seam (see "Data Access" below)
    auth/           # session.ts (validateSession/auth), auth-guards.ts, cookies.ts,
                    #   permissions.ts (canAssignBills, ...), validators.ts (zod schemas)
    bills/          # kanban-columns.ts, dead-bill.ts, derived-status.ts (PURE derivation),
                    #   bill-filters.ts, bill-search.ts, bill-briefing-facts.ts,
                    #   bills-csv.ts, board-display.ts
    versions/       # version-diff.ts, version-labels.ts, bill-versions.ts
    testimony/      # testimony-eligibility.ts, hearing-schedule.ts, tiptap-text.ts,
                    #   session-deadlines.ts, committees.ts
    testimony-export/ # Tiptap → PDF/DOCX (the one Tiptap traversal)
    ai/             # summary-prompts.ts — LLM prompt construction (no inference)
    core/           # utils.ts (cn, toDate, ...), errors.ts, preferences.ts,
                    #   client-ip.ts, ratelimit-memory.ts, react-query.ts, providers.tsx
    __tests__/      # Vitest test files (pure logic only) — FLAT, not mirrored
  db/               # Everything about OUR Postgres
    kysely/         # Kysely client + retry driver
    migrations/     # SQL migration files (up/down)
    types.ts        # Generated Kysely DB types
    queries/        # THE data-access layer — all Kysely queries live here (the single source of truth)
  services/         # EXTERNAL-integration wrappers ONLY: llm.ts, email.ts (Resend), scraper.ts
  types/            # TypeScript type definitions
```

**Where things live (navigation rule for agents):**
- A database query? → `src/db/queries/*` (e.g. `bills-read.ts`, `bills-write.ts`, `bill-assignment.ts`, `proposals.ts`, `admin.ts`, `tags.ts`, `tenants.ts`, `access.ts`, `derived-status.ts`). Mappers (DB row → client `Bill`) are in `bill-mappers.ts`.
- A call to a third-party API (LLM/email/scraper)? → `src/services/*`.
- A client component fetching/mutating data? → it calls `data.*` from `@/lib/data-client` (NOT raw `fetch`).
- Auth/authorization in a route or action? → `@/lib/auth-guards`.

### Multi-Tenancy Model

- **Tenants** are organizations. Each has members with `org_role` (admin | worker).
- **Public users** (no tenant) see food-related bills only.
- **Tenant-scoped users** see bills tracked by anyone in their org.
- Bill statuses: public `bills.bill_status` is derived from AI + org consensus. Each org stores its own status in `org_bills`.
- Tags are tenant-scoped. Bills can have different tags per tenant.
- `user_bills` tracks which user tracks which bill, with `tenant_id` for org scoping.

### Data Access — the switchable data-client (IMPORTANT)

Every data operation has TWO interchangeable implementations over the SAME `db/queries` function:
1. a **Server Action** arm (`src/app/actions/*`, `'use server'`), and
2. an **API-route fetch** arm (`src/app/api/*`).

A flag picks which one runs, invisibly to callers. This exists because Server Actions are idiomatic but were observed to perform worse, so we keep both and can flip between them.

- **Client components/hooks call `data.*`**, never raw `fetch`. e.g. `import { data } from '@/lib/data-client'; await data.bills.getBills({ viewMode, showArchived, tenantId })`. Domains: `data.bills`, `data.proposals`, `data.access`.
- **Transport selection** lives in `src/lib/data-client/transport.ts`: global default `NEXT_PUBLIC_DATA_TRANSPORT` (`'fetch'` | `'action'`, defaults to `'fetch'`) plus a per-operation `OVERRIDES` map keyed `'domain.op'`. `NEXT_PUBLIC_*` is build-time inlined, so the global default is a per-deploy choice; `OVERRIDES` gives code-level per-op control.
- **The contract** (what makes the flag flip with zero caller edits): for every operation, the `action` and `fetch` arms take identical params and return the SAME already-unwrapped value (throw on error). The data-client is the ONE place `ActionResult<T>` and the HTTP envelope get unwrapped. `defineClient` (in `define-client.ts`) structurally requires the fetch arm's signature to match the action arm.
- **Adding an operation:** write the `db/queries` function (the source of truth), add an action wrapper in `actions/<domain>.ts`, add a fetch wrapper hitting the route in `lib/data-client/<domain>.client.ts`, and register the `{ action, fetch }` pair in that domain's `defineClient`.
- The **fetch arm uses relative URLs** → it only runs client-side (all current callers qualify).
- Not everything is flag-switched: `use-tracked-bills` / `assign-bill-dialog` call some `'use server'` query functions directly (valid server actions); the **admin** domain runs exclusively through server actions (`actions/admin.ts`).

### Auth Flow

Auth/authorization for BOTH routes and actions goes through `@/lib/auth-guards`. Four guards, each with `.fromRequest(request, tenantId?)` (routes) and `.fromAction(tenantId?)` (actions):
- `requireSession` — must be logged in.
- `optionalSession` — resolves the user if present, else `{ user: null }` (no throw); for endpoints with a public branch (e.g. the bills list).
- `requireMembership` — logged in AND a member of `tenantId` (returns `orgRole`).
- `requireAdmin` — org admin when tenant-scoped, else legacy global admin.

Guards throw an `ApiError` (`@/lib/errors`); routes map it via `if (error?.statusCode) ...`, actions wrap it in an `ActionResult`. Underneath: `validateSession` / `auth()` (`@/lib/auth`), `getSessionCookie` (`@/lib/cookies`), `validateMembership` (`@/db/queries/tenants`). Do NOT re-implement the cookie→session→membership preamble inline; use a guard.

Tenant service mutation functions (`addMember`, `removeMember`, etc.) also have built-in auth guards; internal callers that already validated auth pass `{ skipAuth: true }`.

### Derived Status Algorithm

`deriveBillStatus()` in `src/lib/bills/derived-status.ts` is a PURE function (no DB) that computes the public bill status:
1. AI status is the floor (official records).
2. Org consensus (mode, or median if no mode) is the ceiling.
3. If consensus >= floor, use consensus (orgs have fresher info). Otherwise use AI.
4. Deferred statuses (not shown as kanban columns) are mapped via `EXTENDED_INDEX` to their logical pipeline positions.

The DB-backed `recomputeDerivedStatus()` (reads `ai_status` + `org_bills`, writes `bills.bill_status`) lives separately in `src/db/queries/derived-status.ts`, keeping the algorithm pure and unit-testable.

### Invite Flow

1. Admin sends invite via `/api/tenants/[id]/invite` (creates `invite_tokens` row, sends email).
2. Recipient clicks link to `/register?invite=TOKEN`.
3. Registration route atomically claims the token (`UPDATE ... WHERE status='pending' RETURNING ...`), verifies the email matches, then creates user + membership.

## Key Conventions

- **Kysely for all queries** — no raw SQL. Parameterized by default (no injection risk). All queries live in `src/db/queries/*` — that is the single source of truth. Routes and actions are thin transports over them; do not put inline `db.*` queries in a route/action.
- **Tenant scoping** — all queries touching `user_bills`, `org_bills`, `tags`, `bill_tags` must filter by `tenant_id` when in a tenant context.
- **`src/lib/` is DB-free** — pure utilities, validators, constants, permission helpers, and the auth-guards/data-client wiring. Anything that runs a query belongs in `src/db/queries/`.
- **`src/lib/` is grouped by domain, imported by deep path** — `@/lib/core/utils`, `@/lib/bills/kanban-columns`, `@/lib/auth/session`. There are deliberately NO barrel `index.ts` files: import the actual module so dependencies stay visible and bundles stay tight. Note `@/lib/auth/session` holds what used to be `lib/auth.ts` (renamed so it couldn't shadow the `auth/` directory).
- **Auth via guards** — routes and actions both authorize through `@/lib/auth-guards` (`requireSession`/`optionalSession`/`requireMembership`/`requireAdmin`). Don't hand-roll the cookie→session→membership preamble.
- **Client data via the data-client** — client components call `data.*` from `@/lib/data-client`, not raw `fetch`. See "Data Access" above.
- **A `'use server'` file may only export async functions** — no `export *`, no re-export statements, no type exports. Keep shared types/mappers in plain (non-`'use server'`) modules like `db/queries/bill-mappers.ts`.
- **Tests** are pure unit tests in `src/lib/__tests__/`. They test pure functions only (no DB, no mocking). Use `describe`/`it`/`expect` from vitest.

## Testing

Tests live in `src/lib/__tests__/`. They cover pure logic only:
- `derived-status.test.ts` — status derivation algorithm
- `kanban-columns.test.ts` — column ordering invariants
- `validators.test.ts` — input validation schemas
- `utils.test.ts` — utility functions (cn, toDate, formatBillStatusName)
- `permissions.test.ts` — role-permission helpers
- `errors.test.ts` — error constants
- `cookies.test.ts` — cookie helpers
- `dead-bill.test.ts` — dead bill detection
- `ratelimit-memory.test.ts` — in-memory rate limiter

Run `npm test` before committing. All tests must pass. Also run `npm run typecheck` and `npm run build` — the build catches `'use server'` export violations that typecheck does not.

## Commit Style

- Prefixes: `feat:`, `fix:`, `bug:`, `refactor:`, `docs:`
- Do NOT add `Co-Authored-By` lines to commit messages.
- Do NOT delete old API routes when creating consolidated replacements.
