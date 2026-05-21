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
    api/            # Next.js API routes (REST endpoints)
    actions/        # Server actions (called from client components)
    register/       # Registration page
  components/       # React components
    admin/          # Admin dashboard components
    auth/           # Auth dialogs, menus, protected wrappers
    kanban/         # Kanban board and card components
    tags/           # Tag management components
  hooks/
    contexts/       # React contexts (AuthContext, BillsContext, KanbanBoardContext)
  lib/              # Pure utilities, validators, constants
    __tests__/      # Vitest test files
  services/
    data/           # Data access layer (legislation, tags, tenants)
  db/
    kysely/         # Kysely client setup
    migrations/     # SQL migration files (up/down)
    types.ts        # Generated Kysely DB types
  types/            # TypeScript type definitions
```

### Multi-Tenancy Model

- **Tenants** are organizations. Each has members with `org_role` (admin | worker).
- **Public users** (no tenant) see food-related bills only.
- **Tenant-scoped users** see bills tracked by anyone in their org.
- Bill statuses: public `bills.bill_status` is derived from AI + org consensus. Each org stores its own status in `org_bills`.
- Tags are tenant-scoped. Bills can have different tags per tenant.
- `user_bills` tracks which user tracks which bill, with `tenant_id` for org scoping.

### Auth Flow

- Session-based via cookies. `auth()` (from `@/lib/auth`) reads the session in server actions.
- API routes use `getSessionCookie(request)` + `validateSession(token)`.
- `validateMembership(userId, tenantId)` checks org membership and returns the role.
- Tenant service mutation functions (`addMember`, `removeMember`, etc.) have built-in auth guards. Internal callers that already validated auth pass `{ skipAuth: true }`.

### Derived Status Algorithm

`deriveBillStatus()` in `src/lib/derived-status.ts` computes the public bill status:
1. AI status is the floor (official records).
2. Org consensus (mode, or median if no mode) is the ceiling.
3. If consensus >= floor, use consensus (orgs have fresher info). Otherwise use AI.
4. Deferred statuses (not shown as kanban columns) are mapped via `EXTENDED_INDEX` to their logical pipeline positions.

### Invite Flow

1. Admin sends invite via `/api/tenants/[id]/invite` (creates `invite_tokens` row, sends email).
2. Recipient clicks link to `/register?invite=TOKEN`.
3. Registration route atomically claims the token (`UPDATE ... WHERE status='pending' RETURNING ...`), verifies the email matches, then creates user + membership.

## Key Conventions

- **Kysely for all queries** — no raw SQL. Parameterized by default (no injection risk).
- **Tenant scoping** — all queries touching `user_bills`, `org_bills`, `tags`, `bill_tags` must filter by `tenant_id` when in a tenant context.
- **API routes** handle auth/authz, then call service functions. Service mutation functions also have their own auth guards (opt-out with `skipAuth`).
- **Server actions** (`'use server'`) in `src/app/actions/` are for Next.js server action calls from client components. They use `auth()` for session validation.
- **Tests** are pure unit tests in `src/lib/__tests__/`. They test pure functions only (no DB, no mocking). Use `describe`/`it`/`expect` from vitest.

## Testing

Tests live in `src/lib/__tests__/`. They cover pure logic only:
- `derived-status.test.ts` — status derivation algorithm
- `kanban-columns.test.ts` — column ordering invariants
- `validators.test.ts` — input validation schemas
- `utils.test.ts` — utility functions
- `errors.test.ts` — error constants
- `cookies.test.ts` — cookie helpers
- `dead-bill.test.ts` — dead bill detection
- `ratelimit-memory.test.ts` — in-memory rate limiter

Run `npm test` before committing. All tests must pass.

## Commit Style

- Prefixes: `feat:`, `fix:`, `bug:`, `refactor:`, `docs:`
- Do NOT add `Co-Authored-By` lines to commit messages.
- Do NOT delete old API routes when creating consolidated replacements.
