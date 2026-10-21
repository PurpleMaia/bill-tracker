# Multi-Tenancy Design Spec

**Date:** 2026-05-18
**Branch:** feat/multi-tenancy
**Status:** Approved

## Overview

Transform the Food+ bill tracker from a single-org application into a multi-tenant platform. Each organization gets its own view of bill statuses, tags, and proposals. Public users (no org membership) see a derived status computed from org consensus and AI classification.

## Database Schema

### New Tables

**`tenants`** — organizations
- `id` UUID PK
- `name` TEXT UNIQUE
- `slug` TEXT UNIQUE (URL-friendly)
- `created_at` TIMESTAMP
- `branding_config` JSONB (logo, theme colors)

**`members`** — org membership
- `id` UUID PK
- `user_id` UUID FK → user(id)
- `tenant_id` UUID FK → tenants(id)
- `org_role` ENUM ('admin', 'worker')
- `created_at` TIMESTAMP
- UNIQUE(user_id, tenant_id)

**`org_bills`** — org-level bill status (one row per tenant+bill)
- `tenant_id` UUID FK → tenants(id)
- `bill_id` UUID FK → bills(id)
- `bill_status` bill_status ENUM
- `updated_at` TIMESTAMP
- PK(tenant_id, bill_id)

### Modified Tables

**`bills`**
- New column: `ai_status` bill_status — raw AI/scraper classification
- `bill_status` becomes the derived public status (pre-computed, not runtime)

**`user`**
- New column: `system_role` ENUM ('sysadmin', 'user') DEFAULT 'user'
- Existing `role` column preserved during migration, deprecated (will be removed in a future migration once all code reads from `members.org_role`)

**`user_bills`**
- New column: `tenant_id` UUID FK → tenants(id), nullable
- NULL tenant_id = public user adoption

**`tags`**
- New column: `tenant_id` UUID FK → tenants(id)
- Unique constraint changes from `(name)` to `(name, tenant_id)`

**`pending_proposals`**
- New column: `tenant_id` UUID FK → tenants(id)

### Unchanged Tables

- `supervisor_users` — table stays as-is (no `tenant_id` column), but queries that fetch supervisors/interns filter by tenant membership via JOIN on `members`
- `bills` core fields — scraper still writes `ai_status`, `current_status_string`, `dead`, etc.
- `status_updates` — global, not org-scoped (legislature facts)
- `user_bill_preferences` — per-user nicknames, not org-scoped

## Data Migration

1. Add `ai_status` column to `bills`, copy existing `bill_status` into it
2. Create Food+ tenant (name: 'Food+', slug: 'food-plus')
3. All existing users become Food+ members (admin → org admin, all others → worker)
4. All existing `user_bills` rows get `tenant_id` set to Food+
5. `org_bills` rows created for every adopted bill, copying `bills.bill_status` as initial org status
6. All existing tags get `tenant_id` set to Food+
7. All existing pending_proposals get `tenant_id` set to Food+

## Derived Status Algorithm (Algorithm B)

Pure function: `deriveBillStatus(aiStatus, orgStatuses[]) → BillStatus`

Uses `KANBAN_COLUMNS` index position to determine pipeline ordering (0 = unassigned, 27 = lawWithoutSignature).

1. If `orgStatuses` is empty → return `aiStatus`
2. `floor` = index of `aiStatus`
3. Compute org consensus: mode (most common status). If no mode, median index position.
4. If consensus index < floor → return `aiStatus` (orgs behind official records)
5. If consensus index >= floor → return consensus status (orgs have fresher info)

**Trigger points** — `recomputeDerivedStatus(billId)` runs and writes to `bills.bill_status` when:
- Any org updates their status in `org_bills`
- The scraper updates `bills.ai_status`

Location: `src/lib/derived-status.ts`

## Auth & Tenant Context

### Session Object

`GET /api/auth/session` returns user + memberships:

```typescript
{
  user: {
    id: string;
    email: string;
    username: string;
    systemRole: 'sysadmin' | 'user';
  };
  memberships: Array<{
    tenantId: string;
    slug: string;
    name: string;
    orgRole: 'admin' | 'worker';
  }>;
}
```

### Tenant Context Flow

1. On login/session check, memberships are fetched in the same call
2. Active tenant stored in localStorage, auto-selected if only one membership
3. `tenantId` passed in request body (POST/PATCH/DELETE) or query param (GET)
4. Backend validates user is a member of the claimed tenant before processing
5. If `tenantId` is omitted, request is treated as public user mode

### AuthContext (Single Context)

```typescript
interface AuthContextType {
  user: {
    id: string;
    email: string;
    username: string;
    systemRole: 'sysadmin' | 'user';
  } | null;
  loading: boolean;
  activeTenant: {
    tenantId: string;
    slug: string;
    name: string;
    orgRole: 'admin' | 'worker';
  } | null;
  memberships: Array<{
    tenantId: string;
    slug: string;
    name: string;
    orgRole: 'admin' | 'worker';
  }>;
  isPublicUser: boolean;
  setActiveTenant: (tenantId: string) => void;
  login(authString: string, password: string): Promise<{ success: boolean; error?: string }>;
  logout(): Promise<void>;
  register(email: string, username: string, password: string): Promise<{ success: boolean; error?: string }>;
  checkSession(): Promise<void>;
}
```

### Role Checks

- **Org-scoped operations** (move bills, manage tags, approve proposals): check `activeTenant.orgRole`
- **System operations** (create tenants, manage all users): check `user.systemRole === 'sysadmin'`
- **Supervisor/intern relationships**: unchanged, checked via `supervisor_users` table

## Consolidated API Routes

### Before → After

```
Auth (unchanged):
  /api/auth/login/route.ts
  /api/auth/logout/route.ts
  /api/auth/session/route.ts
  /api/auth/register/route.ts
  /api/auth/verify-email/route.ts
  /api/auth/resend-verification/route.ts

Bills (consolidated):
  /api/bills/route.ts
    GET    — list bills (query: tenantId, viewMode, showArchived)
    POST   — track a bill (body: tenantId, billUrl)
  /api/bills/[id]/route.ts
    GET    — bill detail
    PATCH  — update status, nickname, tags (body: tenantId, action, ...)
    DELETE — untrack bill (body: tenantId)

Proposals (consolidated):
  /api/proposals/route.ts
    GET    — list proposals (query: tenantId)
    POST   — create proposal (body: tenantId, billId, proposedStatus)
    PATCH  — approve/reject (body: tenantId, proposalId, action)
    DELETE — delete proposal (body: tenantId, proposalId)

Supervisors (consolidated):
  /api/supervisors/route.ts
    GET    — list adoptees / available users (query: tenantId)
    POST   — adopt user (body: tenantId, userId)
    DELETE — drop user (body: tenantId, userId)

Members (new, replaces /api/users):
  /api/members/route.ts
    GET    — list org members (query: tenantId)
    POST   — invite member (body: tenantId, email, orgRole)
    PATCH  — update member role (body: tenantId, userId, orgRole)
    DELETE — remove member (body: tenantId, userId)

Admin (consolidated):
  /api/admin/route.ts
    GET    — pending account requests (query: tenantId)
    POST   — approve/deny user (body: tenantId, userId, action, role)
    PATCH  — update user role (body: tenantId, userId, newRole)

Tenants (new):
  /api/tenants/route.ts
    GET    — list my tenants
    POST   — create tenant (sysadmin only)
  /api/tenants/[id]/route.ts
    GET    — tenant detail
    PATCH  — update branding
    DELETE — delete tenant (sysadmin only)
  /api/tenants/[id]/invite/route.ts
    POST   — send invite (org admin only)
```

### Request Format

All org-scoped requests include `tenantId`:
- **GET**: `?tenantId=uuid`
- **POST/PATCH/DELETE**: `{ tenantId: "uuid", ... }`

Backend validates membership before processing. Omitting `tenantId` = public user mode.

## Service Layer

### Modified Services

**`src/services/data/legislation.ts`** — all query functions gain `tenantId` parameter:
- `getAllTrackedBills(tenantId?)` — if tenantId: join `org_bills` for org status. If null: read `bills.bill_status` (derived).
- `getAllFoodRelatedBills(tenantId?)` — same pattern
- `getUserTrackedBills(userId, tenantId?)` — user's adoptions within the org
- `updateBillStatus(billId, newStatus, tenantId)` — writes to `org_bills`, then calls `recomputeDerivedStatus(billId)`
- `trackBill(userId, billUrl, tenantId?)` — creates `user_bills` row with `tenant_id`. If first adoption in this org, also creates `org_bills` row (initial status = `bills.ai_status`).
- `untrackBill(userId, billId, tenantId?)` — deletes `user_bills` row

**`src/services/data/tags.ts`** — all functions gain `tenantId`:
- `getAllTags(tenantId)` — filtered by tenant
- `createTag(name, color, tenantId)` — scoped to tenant
- `getBillTags(billId, tenantId)` — only tags belonging to tenant
- `updateBillTags(billId, tagIds, tenantId)` — validates tags belong to tenant

### New Services

**`src/services/data/tenants.ts`**:
- `getUserMemberships(userId)` — returns all tenants + roles
- `validateMembership(userId, tenantId)` — returns orgRole or throws 403
- `createTenant(name, slug, brandingConfig)` — sysadmin only
- `inviteMember(tenantId, email, orgRole)` — org admin only
- `removeMember(tenantId, userId)` — org admin only

**`src/lib/derived-status.ts`**:
- `deriveBillStatus(aiStatus, orgStatuses[])` — pure function, Algorithm B
- `recomputeDerivedStatus(billId)` — reads from DB, computes, writes `bills.bill_status`

## Frontend Changes

### AuthContext
- Expanded to include `activeTenant`, `memberships`, `isPublicUser`, `setActiveTenant`
- On login / session check: fetch user + memberships in one call
- Active tenant persisted in localStorage
- Auto-select if user has exactly one membership

### BillsContext
- `fetchBills()` includes `tenantId` in request
- Org users get bills with `org_bills.bill_status`
- Public users get bills with `bills.bill_status` (derived)
- `viewMode` toggle stays: "My Bills" = user's adoptions in the org, "All Bills" = all org-tracked bills

### Header
- Tenant switcher dropdown if user has multiple orgs
- Title reads from `activeTenant.name` or `branding_config`
- Role-based tab visibility uses `activeTenant.orgRole`

### Kanban Board
- Drag-and-drop writes to `org_bills` (PATCH `/api/bills/[id]` with tenantId)
- Proposals scoped to active tenant
- Tags scoped to active tenant
- Public users get read-only board

### Admin Dashboard
- "All Accounts" → "Org Members" scoped to active tenant
- "Pending Requests" → org invite management
- Role changes are org-level (orgRole)
- Sysadmin panel: separate view, only visible if `systemRole === 'sysadmin'`

## User Flows

### Registration
1. User creates account at `/register` — no org, no approval needed, `account_status: 'active'`
2. User is a public user (can browse bills with derived statuses, read-only)
3. Org admin sends invite → user accepts → `members` row created
4. User now has org context, can interact with org-scoped features

### Public User
- Can browse all food-related bills with derived public statuses
- Can track bills personally (`user_bills` with `tenant_id = NULL`)
- Cannot move bills on kanban (read-only)
- Cannot create proposals or manage tags
- Sees "Join an Organization" prompt

### Org Member
- Sees bills with org-specific statuses from `org_bills`
- Can track bills personally (adoption under the org)
- Workers: propose status changes (pending approval)
- Admins: directly move bills, approve proposals, manage tags, invite members

### Sysadmin
- Can create/delete tenants
- Can manage all users across tenants
- Separate from org admin — a sysadmin might not be a member of any org
