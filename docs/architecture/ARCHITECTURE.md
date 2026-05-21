# Food+ Bill Tracker - Architecture Guide

> A comprehensive guide for developers joining the project. Start here to understand how the codebase is structured and how data flows through the system.

## Table of Contents

1. [What is Food+?](#what-is-food)
2. [Tech Stack](#tech-stack)
3. [Directory Structure](#directory-structure)
4. [Data Model](#data-model)
5. [Authentication & Authorization](#authentication--authorization)
6. [Multi-Tenancy](#multi-tenancy)
7. [API Routes](#api-routes)
8. [Client-Side State Management](#client-side-state-management)
9. [The Kanban Board](#the-kanban-board)
10. [Bill Lifecycle](#bill-lifecycle)
11. [Key Patterns](#key-patterns)
12. [Common Tasks](#common-tasks)

---

## What is Food+?

Food+ is a legislative bill tracking application built for the Hawaii Legislature. Organizations (tenants) use it to monitor food-related bills as they move through the legislative process. The main interface is a **Kanban board** where bills are cards that move between columns representing legislative statuses (Introduced, Committee, Floor Vote, etc.).

**Key concepts:**
- **Bills** are scraped from the Hawaii Legislature website
- **Organizations** (tenants) track bills and assign statuses independently
- **Users** within an organization can be admins or workers
- **Public users** can view bill statuses without joining an organization
- **Supervisors** can oversee workers and approve status changes
- The system uses **AI (LLM)** to suggest bill status classifications
- A **derived public status** is computed from all organization statuses + AI input

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript |
| UI | React 18, Radix UI (shadcn/ui), Tailwind CSS |
| Database | PostgreSQL |
| ORM | Kysely (type-safe SQL query builder) |
| Auth | Custom session-based (SHA-256 hashed tokens in cookies) |
| State | React Context + TanStack React Query |
| Drag & Drop | @hello-pangea/dnd |
| Validation | Zod |
| AI | OpenAI API |
| Email | Resend |

---

## Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Home page (routes to Kanban/Admin/Supervisor views)
│   ├── layout.tsx                # Root layout with providers
│   ├── register/page.tsx         # Registration page
│   ├── verify-email/page.tsx     # Email verification page
│   ├── actions/                  # Server actions (called from client components)
│   │   ├── admin.ts              # Admin operations (user management, bulk assign)
│   │   └── bills.ts              # Bill operations (fetch, search, propose)
│   └── api/                      # REST API routes
│       ├── auth/                 # Login, register, logout, session, verify-email
│       ├── bills/                # Bill CRUD, tags, nickname
│       ├── members/              # Tenant member management
│       ├── proposals/            # Bill status change proposals
│       ├── supervisors/          # Supervisor-worker relationships
│       ├── tenants/              # Tenant CRUD, invites
│       └── users/                # User lookup, adoption checks
│
├── components/                   # React components
│   ├── ui/                       # Reusable UI primitives (shadcn/ui)
│   ├── auth/                     # Login/register dialogs, user menu
│   ├── kanban/                   # Kanban board, columns, cards, dialogs
│   ├── admin/                    # Admin dashboard, user management
│   ├── supervisor/               # Supervisor dashboard
│   ├── approvals/                # Bill proposal approval dashboard
│   ├── tags/                     # Tag management and filtering
│   ├── llm/                      # LLM suggestion accept/reject buttons
│   ├── scraper/                  # Manual scrape trigger buttons
│   └── main/                     # App header/navigation
│
├── hooks/                        # Custom React hooks
│   ├── contexts/                 # Global state (Auth, Bills, KanbanBoard)
│   ├── use-tracked-bills.tsx     # Track/untrack bill operations
│   ├── use-query-admin.tsx       # React Query wrapper for admin data
│   ├── use-toast.ts              # Toast notification state
│   └── use-mobile.tsx            # Responsive breakpoint detection
│
├── services/                     # Business logic
│   ├── data/                     # Database query functions
│   │   ├── legislation.ts        # Bill queries (fetch, update, search, track)
│   │   ├── tenants.ts            # Tenant/membership queries
│   │   ├── tags.ts               # Tag CRUD queries
│   │   └── users.ts              # User lookup queries
│   ├── email.ts                  # Email sending (Resend API)
│   ├── scraper.ts                # Legislature website scraper client
│   └── llm.ts                    # OpenAI bill classification
│
├── lib/                          # Utilities and shared logic
│   ├── auth.ts                   # Session management (create, validate, delete)
│   ├── cookies.ts                # Cookie helpers (get, set, clear)
│   ├── errors.ts                 # API error class and constants
│   ├── validators.ts             # Zod validation schemas
│   ├── kanban-columns.ts         # Column definitions and status mapping
│   ├── dead-bill.ts              # Dead bill detection logic
│   ├── derived-status.ts         # Public status derivation algorithm
│   ├── ratelimit-memory.ts       # In-memory rate limiter
│   ├── utils.ts                  # General utilities (cn, toDate, formatBillUrl)
│   ├── react-query.ts            # React Query client configuration
│   └── admin-utils.ts            # Admin header extraction
│
├── db/                           # Database layer
│   ├── kysely/
│   │   ├── client.ts             # PostgreSQL connection pool (singleton)
│   │   └── driver.ts             # Retry driver with exponential backoff
│   ├── types.ts                  # Auto-generated Kysely types (DO NOT EDIT)
│   └── migrations/               # SQL migration files
│
└── types/                        # TypeScript interfaces
    ├── legislation.ts            # Bill, Tag, StatusUpdate, TempBill
    ├── user.ts                   # User, SessionUser, Session
    ├── tenant.ts                 # Tenant, Membership, OrgRole
    └── admin.ts                  # Admin dashboard types
```

---

## Data Model

### Core Tables

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    tenants    │     │   members    │     │     user     │
├──────────────┤     ├──────────────┤     ├──────────────┤
│ id (PK)      │◄────│ tenant_id    │     │ id (PK)      │
│ name         │     │ user_id      │────►│ username     │
│ slug         │     │ org_role     │     │ email        │
│ created_at   │     │ (admin|      │     │ role (legacy)│
│ branding_    │     │  worker)     │     │ system_role  │
│  config      │     │ created_at   │     │ account_     │
└──────────────┘     └──────────────┘     │  status      │
                                          └──────────────┘
                                               │
                          ┌────────────────────┤
                          ▼                    ▼
                  ┌──────────────┐     ┌──────────────┐
                  │  user_bills  │     │   auth_key   │
                  ├──────────────┤     ├──────────────┤
                  │ user_id (FK) │     │ user_id (FK) │
                  │ bill_id (FK) │     │ hashed_      │
                  │ tenant_id    │     │  password    │
                  │ adopted_at   │     └──────────────┘
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐     ┌──────────────┐
                  │    bills     │     │  org_bills   │
                  ├──────────────┤     ├──────────────┤
                  │ id (PK)      │◄────│ bill_id (FK) │
                  │ bill_number  │     │ tenant_id    │
                  │ bill_title   │     │ bill_status  │
                  │ bill_url     │     │ updated_at   │
                  │ bill_status  │     └──────────────┘
                  │ dead (bool)  │
                  │ archived     │     ┌──────────────┐
                  │ food_related │     │  bill_tags   │
                  └──────┬───────┘     ├──────────────┤
                         │             │ bill_id (FK) │
                         ▼             │ tag_id (FK)  │
                  ┌──────────────┐     │ tenant_id    │
                  │status_updates│     └──────┬───────┘
                  ├──────────────┤            │
                  │ bill_id (FK) │            ▼
                  │ chamber      │     ┌──────────────┐
                  │ date         │     │    tags      │
                  │ statustext   │     ├──────────────┤
                  └──────────────┘     │ id (PK)      │
                                       │ name         │
                                       │ color        │
                                       │ tenant_id    │
                                       └──────────────┘
```

### Key Relationships

- A **User** can belong to multiple **Tenants** (organizations) via the **Members** table
- Each membership has an `org_role`: `admin` or `worker`
- **Bills** are global; organizations track them via **user_bills** (with `tenant_id`)
- Each org can have its own status for a bill via **org_bills**
- **Tags** are scoped per tenant
- **Proposals** (pending status changes) are scoped per tenant

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

### Request Authentication

Every API route follows this pattern:

```typescript
// 1. Extract session token from cookie
const session_token = getSessionCookie(request);

// 2. Validate session (throws if invalid)
const user = await validateSession(session_token);

// 3. For tenant-scoped operations, validate membership
const orgRole = await validateMembership(user.id, tenantId);
// Returns 'admin' or 'worker', throws 403 if not a member
```

### Role Hierarchy

```
System Roles (user.systemRole):
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

- **Public users** (not in any org) see a derived "consensus" bill status
- **Org users** see their organization's tracked bills and statuses
- The derived public status is computed from all org statuses + AI input using a weighted median algorithm (see `lib/derived-status.ts`)

---

## API Routes

All API routes live under `src/app/api/` and follow REST conventions:

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/login` | POST | Authenticate user |
| `/api/auth/register` | POST | Create account (+ optional org) |
| `/api/auth/logout` | POST | End session |
| `/api/auth/session` | GET | Get current user + memberships |
| `/api/bills` | GET, POST | List bills / Track a bill |
| `/api/bills/[id]` | GET, PATCH, DELETE | Bill details / Update / Untrack |
| `/api/bills/[id]/tags` | GET, POST | Get/set bill tags |
| `/api/members` | GET, POST, PATCH, DELETE | Manage org members |
| `/api/proposals` | GET, POST, PATCH, DELETE | Bill status proposals |
| `/api/supervisors` | GET, POST, DELETE | Supervisor-worker relationships |
| `/api/tenants` | GET | Get user's tenant memberships |
| `/api/tenants/[id]` | GET | Tenant details |
| `/api/tenants/[id]/invite` | POST | Invite user to org |

### Standard Response Shape

```typescript
// Success
{ success: true, data: { ... } }

// Error
{ success: false, error: "Human-readable error message" }
// or
{ error: "message" }  // with appropriate HTTP status code
```

### Common Auth Pattern in Routes

```typescript
export async function GET(request: NextRequest) {
  try {
    const session_token = getSessionCookie(request);
    const user = await validateSession(session_token);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || undefined;

    if (tenantId) {
      const orgRole = await validateMembership(user.id, tenantId);
      // Use orgRole for permission checks
    }

    // ... business logic ...

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 });
  }
}
```

---

## Client-Side State Management

The app uses three React Context providers (wrapped in `layout.tsx`):

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
Component calls BillsContext function
    │
    ▼
Context makes fetch() to /api/... route
    │
    ▼
API route validates auth, calls service function
    │
    ▼
Service function queries PostgreSQL via Kysely
    │
    ▼
Response flows back through the chain
    │
    ▼
Context updates state → React re-renders UI
```

---

## The Kanban Board

The Kanban board is the primary UI. Bills are displayed as cards in columns representing legislative statuses.

### Column Definitions

Defined in `lib/kanban-columns.ts`. Each column has:
- `id` — The bill status string (e.g., `'introduced'`, `'firstReading'`)
- `title` — Display name (e.g., `'INTRODUCED & WAITING 1ST'`)

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
6. Public derived status recomputed (weighted median of all org statuses + AI)
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

To regenerate types after schema changes: `npm run codegen`

### 2. Zod Validation

Input validation uses Zod schemas defined in `lib/validators.ts`:

```typescript
const validation = loginSchema.safeParse({ identifier, password });
if (!validation.success) {
  const messages = validation.error.issues.map(i => i.message).join(', ');
  return NextResponse.json({ error: messages }, { status: 400 });
}
```

### 3. Error Handling

API errors use the `ApiError` class from `lib/errors.ts`:

```typescript
// In service layer — throw a typed error
throw Errors.UNAUTHORIZED; // ApiError { message, statusCode: 401 }

// In API route — catch and return proper HTTP response
catch (error: any) {
  if (error?.statusCode) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
```

### 4. Server Actions vs. API Routes

- **API Routes** (`src/app/api/`) — Used for client-side `fetch()` calls from React components
- **Server Actions** (`src/app/actions/`) — Used for server-side operations called directly from server components or via `useTransition`

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

### Adding a New API Route

1. Create `src/app/api/<route-name>/route.ts`
2. Export named functions for HTTP methods: `GET`, `POST`, `PATCH`, `DELETE`
3. Always validate session with `getSessionCookie()` + `validateSession()`
4. For tenant-scoped routes, validate membership with `validateMembership()`
5. Use Zod schemas from `lib/validators.ts` for input validation
6. Use `ApiError` from `lib/errors.ts` for error responses

### Adding a New Database Table

1. Create a migration: `npm run migrate:create <name>`
2. Write SQL in `src/db/migrations/<number>_<name>.up.sql`
3. Write rollback in `src/db/migrations/<number>_<name>.down.sql`
4. Run migration: `npm run migrate:up`
5. Regenerate types: `npm run codegen`
6. The new table types appear in `src/db/types.ts`

### Adding a New Component

1. Create in appropriate subdirectory under `src/components/`
2. Use existing UI primitives from `src/components/ui/`
3. Access auth state via `useAuth()` from `hooks/contexts/auth-context`
4. Access bill data via `useBills()` from `hooks/contexts/bills-context`
5. Use `useToast()` for user notifications

### Running the App

```bash
npm run dev          # Start dev server on port 9002
npm run build        # Production build
npm run typecheck    # TypeScript type checking
npm run codegen      # Regenerate Kysely types from DB
npm run migrate:up   # Run pending migrations
```

---

## Known Technical Debt

1. **Legacy `user.role` field** — Being replaced by `systemRole` + `orgRole` (via memberships). Some code still references the old field.
2. **`(db as any)` casts** — Some queries bypass Kysely's type safety. Should be fixed with proper typing.
3. **Missing pagination** — List endpoints can return unbounded results.
4. **Inconsistent error response shapes** — Some routes return `{ success, error }`, others just `{ error }`.
5. **`src/app/actions/bills.ts`** — Contains placeholder functions that need real implementations.
6. **No test suite** — The project currently has no automated tests.
