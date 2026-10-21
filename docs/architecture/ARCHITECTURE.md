# Hawaiʻi Bill Tracker (by Purple Maiʻa & Food+ Policy) - Architecture Guide

> A comprehensive guide for developers joining the project. Start here to understand how the codebase is structured and how data flows through the system.

## Table of Contents

1. [What is the Hawaiʻi Bill Tracker?](#what-is-food)
2. [Tech Stack](#tech-stack)
3. [Getting Started](#getting-started)
4. [Directory Structure](#directory-structure)
5. [Data Model](#data-model)
6. [Data Access — the switchable data-client](#data-access--the-switchable-data-client)
7. [Authentication & Authorization](#authentication--authorization)
8. [Multi-Tenancy](#multi-tenancy)
9. [Derived Bill Status](#derived-bill-status)
10. [Client-Side State Management](#client-side-state-management)
11. [The Kanban Board](#the-kanban-board)
12. [Feature Areas](#feature-areas)
13. [Bill Lifecycle](#bill-lifecycle)
14. [Key Patterns](#key-patterns)
15. [Common Tasks](#common-tasks)
16. [Known Technical Debt](#known-technical-debt)

---

## What is the Hawaiʻi Bill Tracker?

Hawaiʻi Bill Tracker is a legislative bill tracking progressive web application built for the Hawaii Legislature. The main interface is a **Kanban board** where bills are cards that move between columns representing legislative statuses (Introduced & Waiting, Crossover, Conference, etc.). Although the interface focuses on legislative tracking, its real purpose is action, not observation. Users can understand a bill in plain language, get told when it matters, draft and submit testimony, and contact legislators. 

**Key concepts:**
- **Bills** - scraped from the Hawaii Legislature website in a **separate** repo called bill-scraper
- **Search Bills** - pick a bill that peaks your interest by key terms from any legislative year and by a particular status
- **Track Bills** - bills are organized by status in a Kanban-board style, each card contains info like testimony deadlines, legislative deadlines, committees and latest status update. If a bill failed (died), the card itself shows the reason why
- **Testimonies** - users can write their bill drafts in a central place and are walked through the process of submitting testimony on the capitol website. Users also get email alerts when testimony is open for the bill that they track. 
- **Contacting Legislators** - users can draft emails or scripts before contacting a legislator. The app gets the committee members assigned to the user's bill and provides an easy experience to contact them directly. According to what stage the bill is at, the legislator contact list adjusts (conference, governor, etc.)
- **Active Boards** - users can see organizations who actively use Hawaiʻi Bill Tracker and what bills these organizations track. Users can then track the same bill an org tracks. Users can only follow organizations who have flagged themselves as public. 
- **Organizations** (tenants) can track bills and work as a team for their own lobbyist goals
- **Users** within an organization can be admins or workers
- **Admins** can manage workers, invite workers to their organization, and assign bills to certain workers. 
- The system uses a **deterministic pattern table** to change bill statuses
- The system has **opt-in AI** features like: bill summaries and testimony writing assistance

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript |
| Package manager | **pnpm 10** (Node **22.x**) — see `packageManager` in `package.json` |
| UI | React 18, Radix UI (shadcn/ui), Tailwind CSS (light-only), lucide-react |
| Database | PostgreSQL |
| DB access | Kysely (type-safe query builder, **not** an ORM) + `pg` driver |
| Type generation | `kysely-codegen` → `src/db/types.ts` |
| Migrations | `golang-migrate` (sequential `.sql` files) via shell scripts |
| Auth | Custom session-based (SHA-256 hashed token in an HttpOnly cookie), bcrypt passwords |
| State | React Context + TanStack React Query |
| Validation | Zod |
| AI | **OpenAI** (`src/services/llm.ts`) — opt-in summaries & testimony assistance |
| Email | Resend (`src/services/email.ts`) |
| Rich text | Tiptap (testimony editor) |
| Exports | `pdfmake` / `docx` (testimony), `xlsx` / `csv-writer` (bills CSV) |
| Bill diffing | `hawaii-bill-diff` (version comparison) |
| Testing | Vitest (+ @testing-library, jsdom available) |

---

## Getting Started

```bash
# 1. Install (pnpm, not npm)
pnpm install

# 2. Create .env in the repo root (see variables below)

# 3. Run migrations against your database, then generate types
pnpm migrate:up dev      # apply all pending migrations
pnpm codegen             # regenerate src/db/types.ts from the live DB

# 4. Start the dev server
pnpm dev                 # http://localhost:9002
```

**Environment variables** (`.env` in repo root — there is no `.env.example`, so
this list is the reference):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (Kysely + codegen + migrations) |
| `OPENAI_API_KEY` | OpenAI key for bill classification & summaries |
| `OPENAI_BASE_URL` | Optional: alternate/proxy OpenAI endpoint |
| `RESEND_API_KEY` | Resend key for transactional email (invites, verification, resets) |
| `SCRAPER_API_URL` | Base URL of the external `bill-scraper` service |
| `NEXT_PUBLIC_DATA_TRANSPORT` | `fetch` (default) or `action` — data-client transport, see below |
| `NEXT_PUBLIC_DEMO_DEADLINES` | Optional: use demo session deadlines instead of the real calendar |

**Everyday scripts**

```bash
pnpm dev            # dev server on :9002 (Turbopack)
pnpm build          # production build (the real CI/deploy gate)
pnpm start          # run the production build
pnpm test           # vitest run
pnpm test:watch     # vitest watch mode
pnpm typecheck      # tsc --noEmit  (run this — the build ignores type errors!)
pnpm lint           # next lint
pnpm codegen        # regenerate src/db/types.ts (kysely-codegen)
pnpm migrate:up dev # apply migrations   (see docs/db/migration-guide.md)
pnpm migrate:down 1 # roll back N migrations
```

> ⚠️ `next.config.ts` sets `typescript.ignoreBuildErrors: true` and
> `eslint.ignoreDuringBuilds: true`. **A green `pnpm build` does not mean the
> code type-checks or lints.** Run `pnpm typecheck` and `pnpm lint` explicitly.

---

## Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout: providers (React Query, contexts)
│   ├── (main)/                   # Main app route group
│   │   ├── page.tsx              # Home → Kanban board
│   │   ├── search/page.tsx       # Bill search
│   │   ├── your-bills/page.tsx   # The current user's tracked bills
│   │   ├── boards/               # Active org board + browse public boards
│   │   └── testimonies/          # Testimony drafts / submitted lists
│   ├── bills/[id]/               # Per-bill pages: contact legislator, write testimony
│   ├── learn/, register/, reset-password/, verify-email/
│   ├── actions/                  # Server Actions ('use server') — one data-client arm
│   │   ├── bills.ts  proposals.ts  admin.ts  access.ts  boards.ts
│   │   └── committees.ts  legislators.ts  preferences.ts  summaries.ts  testimony.ts
│   └── api/                      # REST API routes — the other data-client arm (42 routes)
│       ├── auth/    (login, register, logout, session, verify-email, google, resets…)
│       ├── bills/   (list, search, track, [id], [id]/tags, [id]/summarize, …)
│       └── boards/  members/  proposals/  supervisors/  tenants/  testimony/  users/
│
├── components/                   # React components, grouped by area
│   ├── ui/                       # shadcn/ui primitives (~37)
│   ├── kanban/                   # Board, columns, cards, dialogs, versions panel
│   └── search/  boards/  testimony/  tags/  admin/  supervisor/  auth/  main/  …
│
├── hooks/
│   ├── contexts/                 # AuthContext, BillsContext, KanbanBoardContext,
│   │                             #   ActiveBoardsContext, CommitteeNamesContext
│   ├── bills/                    # use-bill-crud, use-human-proposals, use-llm-suggestions
│   └── use-tracked-bills, use-bill-search, use-testimonies, use-query-admin, use-toast, …
│
├── services/                     # EXTERNAL integrations ONLY
│   ├── llm.ts                    # OpenAI: classify status, summarize versions/reports
│   ├── email.ts                  # Resend
│   ├── scraper.ts                # External bill-scraper client
│   ├── google-oauth.ts           # Google sign-in
│   └── bill-diff.ts  bill-html.ts
│
├── lib/                          # Pure logic — NO database access. Grouped by domain,
│   │                             #   imported by deep path (no barrel index.ts files).
│   ├── data-client/              # The switchable transport seam (see below)
│   ├── auth/                     # auth-guards, session, cookies, permissions, validators
│   ├── bills/                    # kanban-columns, derived-status, dead-bill, filters,
│   │                             #   search, board-display, progress/detailed-stages, csv
│   ├── testimony/                # eligibility, hearing-schedule, session-deadlines, tiptap
│   ├── testimony-export/         # Tiptap → PDF/DOCX
│   ├── versions/                 # version-diff, version-labels, bill-versions
│   ├── committees/legislators/glossary/ai/   # domain helpers & prompt construction
│   └── core/                     # utils, errors, client-ip, ratelimit, react-query, providers
│
├── db/                           # Everything about OUR Postgres
│   ├── queries/                  # THE data-access layer — all Kysely queries (17 files)
│   ├── kysely/                   # client.ts (pool singleton) + driver.ts (retry driver)
│   ├── migrations/               # golang-migrate .sql files (000001 … 000032)
│   └── types.ts                  # GENERATED by kysely-codegen — do not edit
│
├── types/                        # Shared TS types (legislation, user, tenant, testimony, …)
└── data/                         # Static JSON (session deadlines, seed data)
```

**Where things live (navigation rule)**

| You're touching… | It belongs in… |
|---|---|
| A database query | `src/db/queries/*` (source of truth). Row→client mappers: `bill-mappers.ts` |
| A third-party API (LLM / email / scraper / OAuth) | `src/services/*` |
| Pure logic (no DB, no network) | `src/lib/<domain>/*` |
| A client component fetching/mutating data | call `data.*` from `@/lib/data-client` — never raw `fetch` |
| Auth/authorization in a route or action | `@/lib/auth/auth-guards` |

---

## Data Model

26 tables. See [`docs/db/schema.md`](../db/schema.md) for the full column-level
reference; the generated source of truth is `src/db/types.ts`. The core cluster:

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   tenants    │◄─────│   members    │─────►│    "user"    │
│  (orgs)      │      │  org_role    │      │ system_role  │
└──────┬───────┘      └──────────────┘      └──────┬───────┘
       │                                           │
       │  org_bills (per-org status)               │  auth_key / sessions
       │  tags / bill_tags (tenant-scoped)         │  user_preferences
       │  invite_tokens / org_follows              │
       ▼                                           ▼
┌──────────────┐   user_bills (who tracks   ┌──────────────┐
│    bills     │◄──  what, + tenant_id)  ────│  user_bills  │
│ ai_status    │                            └──────────────┘
│ bill_status  │  (derived public status)
│ dead/archived│
└──────┬───────┘
       ├──► status_updates      (scraped status lines → feed the LLM)
       ├──► bill_versions       (HD1/SD2/… + AI summaries)
       ├──► committee_reports   (committee reports + AI summaries)
       ├──► pending_proposals   (worker status change → admin approval)
       └──► testimonies         (Tiptap drafts, optionally submitted)

legislators ──< committee_chairs >── committees   (legislator-contact routing)
```

Key relationships: a **user** belongs to many **tenants** via **members**;
**bills** are global and orgs relate to them through **user_bills** (tracking)
and **org_bills** (per-org status); **tags** and **proposals** are tenant-scoped.

---

## Data Access — the switchable data-client

**The most important architectural idea in the app.** Every data operation has
**two interchangeable implementations** over the *same* `db/queries` function:

1. a **Server Action** arm — `src/app/actions/<domain>.ts` (`'use server'`), and
2. an **API-route fetch** arm — `src/app/api/<route>` + a fetch wrapper in
   `src/lib/data-client/<domain>.client.ts`.

A flag picks which arm runs, invisibly to callers. Server Actions are idiomatic
but were measured slower in this app, so both paths are kept and switchable.

**Client components/hooks call `data.*`, never raw `fetch`:**

```typescript
import { data } from '@/lib/data-client';
const bills = await data.bills.getBills({ viewMode, showArchived, tenantId });
```

Domains exposed by `data` (`src/lib/data-client/index.ts`): `bills`, `proposals`,
`access`, `preferences`, `testimony`, `boards`, `summaries`, `legislators`,
`committees`.

**Transport selection** (`src/lib/data-client/transport.ts`): the global default
is `NEXT_PUBLIC_DATA_TRANSPORT` (`'fetch'` | `'action'`, **defaults to `fetch`**),
overridable per operation via an `OVERRIDES` map keyed `'domain.op'`.

**The contract** (`define-client.ts`): for every operation, the `action` and
`fetch` arms take identical params and resolve to the **same already-unwrapped
value** (throw on error). The data-client is the *one* place `ActionResult<T>`
and the HTTP envelope get unwrapped, so callers see identical shapes regardless
of transport.

**Adding an operation** (4 steps): write the `db/queries` function → add an
action wrapper in `actions/<domain>.ts` → add a fetch wrapper in
`lib/data-client/<domain>.client.ts` → register the `{ action, fetch }` pair in
that domain's `defineClient(...)`.

```
Client component
   │  data.bills.getBills(params)
   ▼
data-client  ──pickTransport('bills.getBills')──►  'fetch'  or  'action'
   │                                                   │           │
   │                                          getBillsFetch   getBillsAction
   │                                        (GET /api/bills)  ('use server')
   │                                                   └─────┬─────┘
unwrap ActionResult / HTTP envelope  ◄─────────────────────┘
   │                                          both call the SAME
   ▼                                          db/queries/bills-read fn
Bill[]  (identical shape either way)
```

> Not everything is flag-switched: a few hooks call `'use server'` query
> functions directly, and the **admin** domain runs exclusively through server
> actions (`actions/admin.ts`).

---

## Authentication & Authorization

### Session Flow

```
Login Request
    │
    ▼
authenticateUser(identifier, password)
    │ Looks up user by email/username
    │ Verifies password with bcrypt
    │ Checks account_status === 'active'
    │
    ▼
createSession(userId)
    │ Generates random token
    │ Hashes with SHA-256
    │ Stores hash in sessions table
    │ Returns raw token
    │
    ▼
Set Cookie: session=<raw_token>
    │ HttpOnly, SameSite=Lax, 7-day expiry
    │
    ▼
Client stores user + memberships in AuthContext
```

### Authorization — the four guards (`@/lib/auth/auth-guards`)

**Both routes and actions authorize through the same four guards.** Never
hand-roll the cookie→session→membership preamble inline. Each guard exposes
`.fromRequest(request, tenantId?)` (routes, reads the cookie) and
`.fromAction(tenantId?)` (actions, uses `auth()`):

| Guard | Meaning |
|-------|---------|
| `requireSession` | Must be logged in. |
| `optionalSession` | Resolve the user if present, else `{ user: null }` — no throw. For endpoints with a public branch (e.g. the bills list). |
| `requireMembership` | Logged in **and** a member of `tenantId`. Returns `orgRole`. |
| `requireAdmin` | Org admin when tenant-scoped, else legacy global admin. |

Guards throw an `ApiError` (`@/lib/core/errors`). **Routes** map it
(`if (error?.statusCode) return NextResponse.json({ error }, { status })`);
**actions** wrap it in an `ActionResult`.

```typescript
// API route with a public-or-authed branch
export async function GET(request: NextRequest) {
  try {
    const { user } = await optionalSession.fromRequest(request);
    // ... business logic (user may be null) ...
    return NextResponse.json({ bills });
  } catch (error: any) {
    if (error?.statusCode) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
```

### Role Hierarchy

```
System Roles (user.system_role):
  sysadmin  →  Can create tenants, manage system
  user      →  Normal user

Organization Roles (members.org_role):
  admin     →  Can manage members, approve proposals, assign bills
  worker    →  Can track bills, propose status changes

Legacy Role (user.role):
  admin / supervisor / user  →  Being phased out, kept for backward compatibility

Public (no auth):
  Can view bills in read-only mode
```

---

## Multi-Tenancy

The app supports multiple organizations, each with their own:
- **Members** with org-level roles (admin/worker)
- **Bill tracking** (which bills are tracked and their org-specific statuses)
- **Tags** for categorizing bills
- **Proposals** for status changes requiring approval

### How Tenant Context Works

1. On login, the API returns the user's `memberships` array
2. The client's `AuthContext` stores `activeTenant` (the currently selected org)
3. All API calls include `tenantId` as a query param or body field
4. API routes call `validateMembership(userId, tenantId)` to verify access
5. Database queries filter by `tenant_id`

### Public vs. Org Users

- **Public users** (not in any org) see the derived "consensus" bill status.
- **Org users** see their organization's tracked bills and statuses.
- A tenant with `public_board = true` can be browsed/followed by non-members
  (`org_follows`) — see the "Active Boards" feature.

> **Gotcha:** `user_bills.tenant_id` is nullable and many legacy rows are `NULL`.
> Strict tenant-scoped `DELETE`/`SELECT` can silently miss them — account for the
> NULL case when writing tracking queries.

---

## Derived Bill Status

The public `bills.bill_status` is **computed**, not set directly by any one
actor. The algorithm is a **pure** function, `deriveBillStatus(aiStatus,
orgStatuses)` in `src/lib/bills/derived-status.ts`:

1. If there are no org statuses → return the AI status.
2. **Floor** = the AI status's pipeline index (official records).
3. **Consensus** = the mode of org statuses (median index if there's no clear mode).
4. If consensus is *behind* the floor → return the AI status (orgs are stale).
5. Otherwise → return the consensus (orgs have fresher info).

Deferred statuses (e.g. `deferred1`, which aren't Kanban columns) are mapped via
`EXTENDED_INDEX` to a logical pipeline position so they compare correctly.

The **DB-backed** `recomputeDerivedStatus()` (reads `ai_status` + `org_bills`,
writes `bills.bill_status`) lives separately in `src/db/queries/derived-status.ts`,
keeping the algorithm itself pure and unit-testable
(`__tests__/derived-status.test.ts`).

---

## Client-Side State Management

The app uses React Context providers (wrapped in `layout.tsx`) for global UI
state. The three primary ones are below; two more scope narrower concerns —
`ActiveBoardsContext` (the currently-viewed org board) and
`CommitteeNamesContext` (committee acronym → name lookups). Server-cached data
(admin dashboard, search, tracking) additionally goes through TanStack React
Query hooks in `src/hooks/`.

### 1. AuthContext (`hooks/contexts/auth-context.tsx`)

Manages user authentication state.

```
Provides:
  user          → Current User object (or null)
  memberships   → Array of Membership objects
  activeTenant  → Currently selected org (or null for public)
  login()       → Authenticate and set user state
  logout()      → Clear session and reset state
  register()    → Create account (+ optional org)
  setActiveTenant() → Switch between organizations
```

### 2. BillsContext (`hooks/contexts/bills-context.tsx`)

Manages bill data and operations.

```
Provides:
  bills         → Array of Bill objects for current view
  tempBills     → Pending proposals (TempBill objects)
  loading       → Loading state
  fetchBills()  → Refresh bill data
  proposeBillStatusChange()  → Worker proposes a status change
  acceptLLMChange()          → Accept AI-suggested status
  rejectLLMChange()          → Reject AI-suggested status
  toggleViewMode()           → Switch between my-bills / all-bills
  toggleShowArchived()       → Show/hide archived bills
```

### 3. KanbanBoardContext (`hooks/contexts/kanban-board-context.tsx`)

Manages UI state for the board.

```
Provides:
  view          → Current view (kanban/admin/supervisor/approvals)
  setView()     → Switch views
  searchQuery   → Bill search text
  setSearchQuery()
  selectedTags  → Active tag filters
  selectedYear  → Year filter
```

### Data Flow

```
User interacts with Kanban Board
    │
    ▼
Component / context calls data.<domain>.<op>(...)      (@/lib/data-client)
    │
    ▼
data-client picks transport → API route (fetch)  OR  Server Action
    │
    ▼
Route/action authorizes via an auth guard, then calls a db/queries function
    │
    ▼
db/queries function queries PostgreSQL via Kysely
    │
    ▼
data-client unwraps the result to a plain value (throws on error)
    │
    ▼
Context / React Query updates state → React re-renders UI
```

---

## The Kanban Board

The Kanban board is the primary UI. Bills are displayed as cards in columns representing legislative statuses.

### Column Definitions

Defined in `src/lib/bills/kanban-columns.ts`. Each column has:
- `id` — The bill status string (e.g., `'introduced'`, `'scheduled1'`, `'crossoverWaiting1'`)
- `title` — Display name (e.g., `'INTRODUCED & WAITING 1ST'`)

Two layouts exist (per-user, via `user_preferences.kanban_detailed_view`):
`KANBAN_COLUMNS` (detailed — every stage) and `SIMPLIFIED_COLUMNS` (collapsed);
`STATUS_TO_SIMPLIFIED` maps each `BillStatus` to its simplified column, and
`COLUMN_DESCRIPTIONS` holds the plain-language help text shown in column headers.

### View Modes

- **My Bills** — Shows only bills tracked by the current user
- **All Bills** — Shows all bills tracked by the organization
- **Public View** — Read-only view for unauthenticated users

### Drag and Drop

When a bill card is dragged to a new column:

1. **Admin** → Status updates immediately via API (`PATCH /api/bills/[id]`)
2. **Worker** → Creates a proposal (`POST /api/proposals`) that an admin must approve
3. **Public** → Drag is disabled (read-only)

### Bill Cards Show

- Bill number and title
- Tags (color-coded badges)
- Tracked-by count
- Dead bill indicator (if applicable)
- LLM suggestion indicator (accept/reject buttons)

---

## Bill Lifecycle

```
1. Bill Scraped from Legislature Website
       │
       ▼
2. Stored in bills table (food_related flagged by AI)
       │
       ▼
3. User Tracks Bill (creates user_bills record with tenant_id)
       │
       ▼
4. Bill Appears on Org's Kanban Board
       │
       ├─── Admin drags card → Status updates immediately
       │
       ├─── Worker drags card → Proposal created → Admin approves/rejects
       │
       ├─── LLM suggests status → Admin accepts/rejects
       │
       └─── Scraper detects update → Status auto-updated
       │
       ▼
5. Org status stored in org_bills table
       │
       ▼
6. Public derived status recomputed (AI floor + org consensus; see Derived Bill Status)
       │
       ▼
7. Dead Bill Detection runs (based on legislative deadlines)
       │ If bill misses a deadline → marked as dead
       │
       ▼
8. Bill Archived (end of legislative session)
```

---

## Key Patterns

### 1. Kysely Type-Safe Queries

All database queries use Kysely, which provides TypeScript types from the database schema:

```typescript
// Types are auto-generated in db/types.ts
const bill = await db
  .selectFrom('bills')
  .select(['id', 'bill_number', 'bill_title'])
  .where('id', '=', billId)
  .executeTakeFirst();
```

To regenerate types after schema changes: `pnpm codegen`. **All queries live in
`src/db/queries/*`** — never inline `db.*` in a route or action.

### 2. Zod Validation

Input validation uses Zod schemas defined in `src/lib/auth/validators.ts` (and
other domain modules):

```typescript
const validation = loginSchema.safeParse({ identifier, password });
if (!validation.success) {
  const messages = validation.error.issues.map(i => i.message).join(', ');
  return NextResponse.json({ error: messages }, { status: 400 });
}
```

### 3. Error Handling

API errors use the `ApiError` class from `@/lib/core/errors`:

```typescript
// In a query/guard — throw a typed error
throw Errors.UNAUTHORIZED; // ApiError { message, statusCode: 401 }

// In API route — catch and return proper HTTP response
catch (error: any) {
  if (error?.statusCode) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
```

### 4. Two transports, one data-client

Both `src/app/api/` (routes) and `src/app/actions/` (server actions) exist as
**interchangeable transports** over the same `db/queries` functions. Client code
does not choose between them — it calls `data.*` and the data-client picks the
transport (see [Data Access](#data-access--the-switchable-data-client)). A
`'use server'` file may export **only** async functions (no `export *`, no type
exports) — keep shared types/mappers in plain modules like `db/queries/bill-mappers.ts`.

### 5. React Query for Admin Dashboard

The admin dashboard uses TanStack React Query for data fetching with automatic caching:

```typescript
// In use-query-admin.tsx
const { data: pendingUsers } = useQuery({
  queryKey: ['admin', 'pendingUsers', tenantId],
  queryFn: () => getAllAccounts(tenantId),
});
```

---

## Common Tasks

### Adding a data operation (so the client can call it)

See [Data Access](#data-access--the-switchable-data-client): write the
`db/queries` function → add an action wrapper in `actions/<domain>.ts` → add a
fetch wrapper in `lib/data-client/<domain>.client.ts` → register the
`{ action, fetch }` pair in that domain's `defineClient(...)`.

### Adding a New API Route

1. Create `src/app/api/<route-name>/route.ts`
2. Export named functions for HTTP methods: `GET`, `POST`, `PATCH`, `DELETE`
3. Authorize with a guard from `@/lib/auth/auth-guards` (never hand-roll the
   cookie→session→membership preamble)
4. Validate input with a Zod schema
5. Call a `db/queries` function for data access; map `ApiError` in the `catch`

### Adding a New Database Table

1. Create a migration: `pnpm migrate:create <name>`
2. Write SQL in `src/db/migrations/<number>_<name>.up.sql`
3. Write rollback in `src/db/migrations/<number>_<name>.down.sql`
4. Run migration: `pnpm migrate:up`
5. Regenerate types: `pnpm codegen`
6. The new table types appear in `src/db/types.ts`

### Adding a New Component

1. Create in appropriate subdirectory under `src/components/`
2. Use existing UI primitives from `src/components/ui/`
3. Access auth state via `useAuth()` from `hooks/contexts/auth-context`
4. Access bill data via `useBills()` from `hooks/contexts/bills-context`
5. Use `useToast()` for user notifications; for data, call `data.*` (not raw `fetch`)

### Running the App

```bash
pnpm dev          # Start dev server on port 9002
pnpm build        # Production build
pnpm typecheck    # TypeScript type checking (the build ignores type errors)
pnpm codegen      # Regenerate Kysely types from DB
pnpm migrate:up   # Run pending migrations
```

---

## Known Technical Debt

1. **Type & lint errors are not enforced by the build.** `next.config.ts` sets
   `ignoreBuildErrors` and `ignoreDuringBuilds`, so `pnpm build` passes even with
   type/lint errors. `pnpm typecheck` currently reports pre-existing
   `implicit any` errors (e.g. `use-query-admin.tsx`). Run typecheck/lint in CI
   separately.
2. **Legacy `user.role`** coexists with `system_role` + per-org `org_role`; some
   code still reads the old field.
3. **`user_bills.tenant_id` NULL drift** — many legacy tracking rows have a NULL
   tenant; strict tenant-scoped queries can miss them.
4. **Inconsistent API response shapes** — some routes return `{ success, data }`,
   others `{ data }` or `{ error }`. The data-client normalizes on read, but the
   routes themselves aren't uniform.
5. **Incomplete pagination** — search is cursor-paginated, but not every list
   endpoint is bounded.
6. **Dependency freshness** — `pnpm install` warns that `next@15.2.6` has a
   security advisory and `recharts@2.x` is EOL; plan upgrades.
