# Active Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Active Boards" surface where a logged-in user follows public organizations and views one followed org's kanban board at a time, with the ability to track a bill into their own context.

**Architecture:** Two new migrations (`tenants.public_board` flag + `org_follows` table). A new `boards` data-client domain (action + fetch arms over new `db/queries` functions) authorized by `requireSession` + a public-board gate (NOT membership). A dedicated `ActiveBoardsProvider` holds the viewed org's bills + org-level testimony statuses (refetched on org switch); it does NOT reuse the global `BillsProvider`. The existing `KanbanBoard`/`KanbanColumn`/`KanbanCard` are reused, branching on a new `boardMode` prop (default `'own'`) threaded down from the board root — no forked card component.

**Tech Stack:** Next.js 15 App Router, TypeScript, Kysely/PostgreSQL, custom session auth via `@/lib/auth-guards`, shadcn/ui, Vitest.

## Global Constraints

- All DB access lives in `src/db/queries/*` — routes/actions are thin transports; no inline `db.*` in routes/actions except the existing tenants PATCH pattern.
- Client components call `data.*` from `@/lib/data-client`, never raw `fetch`.
- Auth via `@/lib/auth-guards` guards only; never hand-roll cookie→session→membership.
- A `'use server'` file may export ONLY async functions — no `export *`, no type exports. Shared types live in non-`'use server'` modules.
- Tenant-scoped queries filter by `tenant_id`.
- `boardMode` defaults to `'own'`; the existing `/`, admin, spreadsheet views must be byte-for-byte unchanged when `boardMode === 'own'`.
- The in-board text box is labeled "Filter this board…", never "Search" (avoids colliding with the `/search` nav tab).
- Public board visibility defaults OFF (opt-in).
- Commit prefixes: `feat:` `fix:` `refactor:` `docs:`. Do NOT add `Co-Authored-By` lines.
- Do NOT delete old API routes.
- Run `npm test`, `npm run typecheck`, `npm run build` before considering work complete (build catches `'use server'` export violations).

---

### Task 1: Migrations — `public_board` flag + `org_follows` table

**Files:**
- Create: `src/db/migrations/000025_add_public_board_to_tenants.up.sql`
- Create: `src/db/migrations/000025_add_public_board_to_tenants.down.sql`
- Create: `src/db/migrations/000026_create_org_follows_table.up.sql`
- Create: `src/db/migrations/000026_create_org_follows_table.down.sql`
- Modify: `src/db/types.ts` (regenerated / hand-edited to match)

**Interfaces:**
- Produces: `tenants.public_board: boolean` column; `org_follows` table with `(user_id, tenant_id)` unique.

- [ ] **Step 1: Write `000025` up migration**

`src/db/migrations/000025_add_public_board_to_tenants.up.sql`:
```sql
ALTER TABLE tenants ADD COLUMN public_board BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Write `000025` down migration**

`src/db/migrations/000025_add_public_board_to_tenants.down.sql`:
```sql
ALTER TABLE tenants DROP COLUMN IF EXISTS public_board;
```

- [ ] **Step 3: Write `000026` up migration**

`src/db/migrations/000026_create_org_follows_table.up.sql`:
```sql
CREATE TABLE org_follows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);

CREATE INDEX idx_org_follows_user_id ON org_follows(user_id);
```

- [ ] **Step 4: Write `000026` down migration**

`src/db/migrations/000026_create_org_follows_table.down.sql`:
```sql
DROP TABLE IF EXISTS org_follows;
```

- [ ] **Step 5: Run the migrations**

Run: `npm run migrate:up`
Expected: both migrations apply with no error; `npm run migrate:version` shows `000026`.

- [ ] **Step 6: Update `src/db/types.ts`**

In the `Tenants` interface add:
```typescript
  public_board: Generated<boolean>;
```
Add a new `OrgFollows` interface (place alphabetically near `Members`):
```typescript
export interface OrgFollows {
  id: Generated<string>;
  user_id: string;
  tenant_id: string;
  created_at: Generated<Timestamp | null>;
}
```
And add to the root `DB` interface:
```typescript
  org_follows: OrgFollows;
```

- [ ] **Step 7: Typecheck & commit**

Run: `npm run typecheck`
Expected: PASS
```bash
git add src/db/migrations/000025_* src/db/migrations/000026_* src/db/types.ts
git commit -m "feat: add public_board flag and org_follows table"
```

---

### Task 2: `db/queries` — public tenants, follows, org testimony

**Files:**
- Modify: `src/db/queries/tenants.ts`
- Modify: `src/db/queries/testimony.ts`
- Test: `src/lib/__tests__/board-display-rules.test.ts` (pure helper — see Task 6; no DB test here)

**Interfaces:**
- Produces:
  - `listPublicTenants(viewerUserId: string): Promise<PublicOrg[]>` where `PublicOrg = { tenantId: string; name: string; slug: string; isFollowing: boolean }`
  - `getPublicTenant(tenantId: string): Promise<{ id: string; name: string; slug: string } | null>` (returns null if not `public_board`)
  - `setPublicBoard(tenantId: string, enabled: boolean): Promise<void>`
  - `followOrg(userId: string, tenantId: string): Promise<void>`
  - `unfollowOrg(userId: string, tenantId: string): Promise<void>`
  - `listFollowedTenants(userId: string): Promise<PublicOrg[]>` (only public + followed)
  - `getOrgTestimonyBillIds(tenantId: string, billIds: string[]): Promise<string[]>`

- [ ] **Step 1: Add `PublicOrg` type + public/follow queries to `tenants.ts`**

Append to `src/db/queries/tenants.ts` (all functions are `async`, file is already `'use server'` — so ONLY async function exports; put the `PublicOrg` type in `src/types/tenant.ts` instead, see Step 2):

```typescript
/**
 * All orgs that opted into public board visibility, with an isFollowing flag
 * for the viewer. Used by the Browse Orgs tab.
 */
export async function listPublicTenants(viewerUserId: string) {
  const rows = await db
    .selectFrom('tenants as t')
    .leftJoin('org_follows as f', (join) =>
      join.onRef('f.tenant_id', '=', 't.id').on('f.user_id', '=', viewerUserId),
    )
    .select(['t.id as tenantId', 't.name', 't.slug', 'f.id as followId'])
    .where('t.public_board', '=', true)
    .orderBy('t.name', 'asc')
    .execute();

  return rows.map((r) => ({
    tenantId: r.tenantId,
    name: r.name,
    slug: r.slug,
    isFollowing: r.followId !== null,
  }));
}

/** Returns the org iff it has opted into public visibility, else null. */
export async function getPublicTenant(tenantId: string) {
  const row = await db
    .selectFrom('tenants')
    .select(['id', 'name', 'slug'])
    .where('id', '=', tenantId)
    .where('public_board', '=', true)
    .executeTakeFirst();
  return row ?? null;
}

/** Admin write: toggle this org's public board visibility. */
export async function setPublicBoard(tenantId: string, enabled: boolean): Promise<void> {
  await db
    .updateTable('tenants')
    .set({ public_board: enabled })
    .where('id', '=', tenantId)
    .execute();
}

/** Follow an org (idempotent via UNIQUE(user_id, tenant_id)). */
export async function followOrg(userId: string, tenantId: string): Promise<void> {
  await db
    .insertInto('org_follows')
    .values({ user_id: userId, tenant_id: tenantId })
    .onConflict((oc) => oc.columns(['user_id', 'tenant_id']).doNothing())
    .execute();
}

export async function unfollowOrg(userId: string, tenantId: string): Promise<void> {
  await db
    .deleteFrom('org_follows')
    .where('user_id', '=', userId)
    .where('tenant_id', '=', tenantId)
    .execute();
}

/** Orgs the user follows that are still public, for the board switcher. */
export async function listFollowedTenants(userId: string) {
  const rows = await db
    .selectFrom('org_follows as f')
    .innerJoin('tenants as t', 't.id', 'f.tenant_id')
    .select(['t.id as tenantId', 't.name', 't.slug'])
    .where('f.user_id', '=', userId)
    .where('t.public_board', '=', true)
    .orderBy('t.name', 'asc')
    .execute();

  return rows.map((r) => ({
    tenantId: r.tenantId,
    name: r.name,
    slug: r.slug,
    isFollowing: true as const,
  }));
}
```

- [ ] **Step 2: Add the `PublicOrg` type to `src/types/tenant.ts`**

`tenants.ts` is `'use server'` and cannot export types. Add to `src/types/tenant.ts`:
```typescript
export interface PublicOrg {
  tenantId: string;
  name: string;
  slug: string;
  isFollowing: boolean;
}
```

- [ ] **Step 3: Add `getOrgTestimonyBillIds` to `testimony.ts`**

Append to `src/db/queries/testimony.ts`:
```typescript
/**
 * Of the given billIds, which have at least one testimony written by anyone
 * in this org. The org-level "testimony written" signal for Active Boards
 * (distinct from the per-user getTestimonyStatuses).
 */
export async function getOrgTestimonyBillIds(
  tenantId: string,
  billIds: string[],
): Promise<string[]> {
  if (billIds.length === 0) return [];
  const rows = await db
    .selectFrom('testimonies')
    .select('bill_id')
    .distinct()
    .where('tenant_id', '=', tenantId)
    .where('bill_id', 'in', billIds)
    .execute();
  return rows.map((r) => r.bill_id);
}
```

- [ ] **Step 4: Typecheck & commit**

Run: `npm run typecheck`
Expected: PASS
```bash
git add src/db/queries/tenants.ts src/db/queries/testimony.ts src/types/tenant.ts
git commit -m "feat: add public-tenant, follow, and org-testimony queries"
```

---

### Task 3: `boards` server actions + API routes

**Files:**
- Create: `src/app/actions/boards.ts` (`'use server'`)
- Create: `src/app/api/boards/route.ts`
- Create: `src/app/api/boards/follow/route.ts`
- Create: `src/app/api/boards/[tenantId]/bills/route.ts`

**Interfaces:**
- Consumes: Task 2 queries; `getAllTrackedBills` from `bills-read.ts`; `requireSession`, `requireAdmin` from auth-guards; `PublicOrg` from `@/types/tenant`; `Bill` from `@/types/legislation`.
- Produces (action signatures, imported by Task 4):
  - `listPublicOrgsAction(): Promise<PublicOrg[]>`
  - `listFollowedOrgsAction(): Promise<PublicOrg[]>`
  - `followOrgAction(params: { tenantId: string }): Promise<void>`
  - `unfollowOrgAction(params: { tenantId: string }): Promise<void>`
  - `getBoardAction(params: { tenantId: string; showArchived: boolean }): Promise<Bill[]>`
  - `getOrgTestimonyStatusAction(params: { tenantId: string; billIds: string[] }): Promise<string[]>`
  - Param types exported from a NON-`'use server'` module `src/lib/data-client/boards.params.ts`.

- [ ] **Step 1: Create the shared param types module**

`src/lib/data-client/boards.params.ts` (plain module — actions file can't export types):
```typescript
export interface GetBoardParams {
  tenantId: string;
  showArchived: boolean;
}

export interface FollowParams {
  tenantId: string;
}

export interface OrgTestimonyStatusParams {
  tenantId: string;
  billIds: string[];
}
```

- [ ] **Step 2: Create `src/app/actions/boards.ts`**

```typescript
'use server';

import type { Bill } from '@/types/legislation';
import type { PublicOrg } from '@/types/tenant';
import { requireSession } from '@/lib/auth-guards';
import { ApiError } from '@/lib/errors';
import {
  listPublicTenants,
  listFollowedTenants,
  followOrg,
  unfollowOrg,
  getPublicTenant,
} from '@/db/queries/tenants';
import { getOrgTestimonyBillIds } from '@/db/queries/testimony';
import { getAllTrackedBills } from '@/db/queries/bills-read';
import type {
  GetBoardParams,
  FollowParams,
  OrgTestimonyStatusParams,
} from '@/lib/data-client/boards.params';

export async function listPublicOrgsAction(): Promise<PublicOrg[]> {
  const { user } = await requireSession.fromAction();
  return listPublicTenants(user.id);
}

export async function listFollowedOrgsAction(): Promise<PublicOrg[]> {
  const { user } = await requireSession.fromAction();
  return listFollowedTenants(user.id);
}

export async function followOrgAction(params: FollowParams): Promise<void> {
  const { user } = await requireSession.fromAction();
  // Only allow following orgs that are actually public.
  const org = await getPublicTenant(params.tenantId);
  if (!org) throw new ApiError('TENANT_NOT_FOUND', 404, 'Organization not found');
  await followOrg(user.id, params.tenantId);
}

export async function unfollowOrgAction(params: FollowParams): Promise<void> {
  const { user } = await requireSession.fromAction();
  await unfollowOrg(user.id, params.tenantId);
}

export async function getBoardAction(params: GetBoardParams): Promise<Bill[]> {
  await requireSession.fromAction();
  const org = await getPublicTenant(params.tenantId);
  if (!org) throw new ApiError('BOARD_NOT_FOUND', 404, 'Board not found');
  // includeTrackedBy: false — person-tracking data never leaves the DB here.
  return getAllTrackedBills(params.showArchived, params.tenantId, false);
}

export async function getOrgTestimonyStatusAction(
  params: OrgTestimonyStatusParams,
): Promise<string[]> {
  await requireSession.fromAction();
  const org = await getPublicTenant(params.tenantId);
  if (!org) throw new ApiError('BOARD_NOT_FOUND', 404, 'Board not found');
  return getOrgTestimonyBillIds(params.tenantId, params.billIds);
}
```

> NOTE: `@/lib/errors` exports the `ApiError` class (constructor `(code, statusCode, message)`) and a flat `Errors` object of pre-built instances — there is no `Errors.notFound()` factory. Constructing `new ApiError('BOARD_NOT_FOUND', 404, ...)` is correct and consistent with how routes map `error?.statusCode`. (`Errors.TENANT_NOT_FOUND` also exists as a 404 if you prefer a shared instance.)

- [ ] **Step 3: Create `src/app/api/boards/route.ts` (list public + followed)**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth-guards';
import { listPublicTenants, listFollowedTenants } from '@/db/queries/tenants';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope'); // 'public' | 'followed'
    const orgs =
      scope === 'followed'
        ? await listFollowedTenants(user.id)
        : await listPublicTenants(user.id);
    return NextResponse.json({ orgs }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in boards GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create `src/app/api/boards/follow/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth-guards';
import { followOrg, unfollowOrg, getPublicTenant } from '@/db/queries/tenants';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { tenantId } = await request.json();
    const org = await getPublicTenant(tenantId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }
    await followOrg(user.id, tenantId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in boards follow POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireSession.fromRequest(request);
    const { tenantId } = await request.json();
    await unfollowOrg(user.id, tenantId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in boards follow DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Create `src/app/api/boards/[tenantId]/bills/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth-guards';
import { getPublicTenant } from '@/db/queries/tenants';
import { getOrgTestimonyBillIds } from '@/db/queries/testimony';
import { getAllTrackedBills } from '@/db/queries/bills-read';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    await requireSession.fromRequest(request);
    const { tenantId } = await params;
    const { searchParams } = new URL(request.url);
    const showArchived = searchParams.get('showArchived') === 'true';
    const wantTestimony = searchParams.get('testimony') === 'true';

    const org = await getPublicTenant(tenantId);
    if (!org) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const bills = await getAllTrackedBills(showArchived, tenantId, false);

    if (wantTestimony) {
      const testimonyBillIds = await getOrgTestimonyBillIds(
        tenantId,
        bills.map((b) => b.id),
      );
      return NextResponse.json({ bills, testimonyBillIds }, { status: 200 });
    }

    return NextResponse.json({ bills }, { status: 200 });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in board bills GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck & commit**

Run: `npm run typecheck`
Expected: PASS
```bash
git add src/app/actions/boards.ts src/app/api/boards src/lib/data-client/boards.params.ts
git commit -m "feat: add boards server actions and API routes"
```

---

### Task 4: `boards` data-client domain

**Files:**
- Create: `src/lib/data-client/boards.client.ts`
- Modify: `src/lib/data-client/index.ts`

**Interfaces:**
- Consumes: Task 3 actions + param types.
- Produces: `data.boards.listPublicOrgs()`, `.listFollowed()`, `.follow({tenantId})`, `.unfollow({tenantId})`, `.getBoard({tenantId, showArchived})`, `.getOrgTestimonyStatus({tenantId, billIds})`.

- [ ] **Step 1: Create `src/lib/data-client/boards.client.ts`**

```typescript
import type { Bill } from '@/types/legislation';
import type { PublicOrg } from '@/types/tenant';
import { defineClient } from './define-client';
import type {
  GetBoardParams,
  FollowParams,
  OrgTestimonyStatusParams,
} from './boards.params';
import {
  listPublicOrgsAction,
  listFollowedOrgsAction,
  followOrgAction,
  unfollowOrgAction,
  getBoardAction,
  getOrgTestimonyStatusAction,
} from '@/app/actions/boards';

// ---- fetch arm (hits /api/boards*, unwraps the HTTP envelope) ----

async function listPublicOrgsFetch(): Promise<PublicOrg[]> {
  const res = await fetch('/api/boards?scope=public');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load orgs');
  return ((await res.json()).orgs ?? []) as PublicOrg[];
}

async function listFollowedOrgsFetch(): Promise<PublicOrg[]> {
  const res = await fetch('/api/boards?scope=followed');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load followed orgs');
  return ((await res.json()).orgs ?? []) as PublicOrg[];
}

async function followOrgFetch(params: FollowParams): Promise<void> {
  const res = await fetch('/api/boards/follow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: params.tenantId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to follow');
}

async function unfollowOrgFetch(params: FollowParams): Promise<void> {
  const res = await fetch('/api/boards/follow', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: params.tenantId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to unfollow');
}

async function getBoardFetch(params: GetBoardParams): Promise<Bill[]> {
  const qs = new URLSearchParams({ showArchived: String(params.showArchived) });
  const res = await fetch(`/api/boards/${params.tenantId}/bills?${qs.toString()}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load board');
  return ((await res.json()).bills ?? []) as Bill[];
}

async function getOrgTestimonyStatusFetch(params: OrgTestimonyStatusParams): Promise<string[]> {
  const qs = new URLSearchParams({ showArchived: 'true', testimony: 'true' });
  const res = await fetch(`/api/boards/${params.tenantId}/bills?${qs.toString()}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load testimony status');
  const data = await res.json();
  const wanted = new Set(params.billIds);
  return ((data.testimonyBillIds ?? []) as string[]).filter((id) => wanted.has(id));
}

export const boardsClient = defineClient('boards', {
  listPublicOrgs: { action: listPublicOrgsAction, fetch: listPublicOrgsFetch },
  listFollowed: { action: listFollowedOrgsAction, fetch: listFollowedOrgsFetch },
  follow: { action: followOrgAction, fetch: followOrgFetch },
  unfollow: { action: unfollowOrgAction, fetch: unfollowOrgFetch },
  getBoard: { action: getBoardAction, fetch: getBoardFetch },
  getOrgTestimonyStatus: { action: getOrgTestimonyStatusAction, fetch: getOrgTestimonyStatusFetch },
});
```

- [ ] **Step 2: Register in `src/lib/data-client/index.ts`**

Add the import and entry:
```typescript
import { boardsClient } from './boards.client';
```
```typescript
export const data = {
  bills: billsClient,
  proposals: proposalsClient,
  access: accessClient,
  preferences: preferencesClient,
  testimony: testimonyClient,
  boards: boardsClient,
};
```

- [ ] **Step 3: Typecheck, build, commit**

Run: `npm run typecheck && npm run build`
Expected: PASS (build verifies the `'use server'` actions file exports only async functions).
```bash
git add src/lib/data-client/boards.client.ts src/lib/data-client/index.ts
git commit -m "feat: add boards data-client domain"
```

---

### Task 5: `ActiveBoardsProvider` context

**Files:**
- Create: `src/hooks/contexts/active-boards-context.tsx`

**Interfaces:**
- Consumes: `data.boards.*` (Task 4); `PublicOrg`; `Bill`.
- Produces: `useActiveBoards()` returning:
  ```typescript
  {
    followedOrgs: PublicOrg[];
    refreshFollowed: () => Promise<void>;
    selectedOrgId: string | null;
    selectOrg: (tenantId: string) => void;
    bills: Bill[];
    loadingBills: boolean;
    testimonyBillIds: Set<string>;   // org-level "testimony written"
    follow: (tenantId: string) => Promise<void>;
    unfollow: (tenantId: string) => Promise<void>;
  }
  ```
- `boardMode` is NOT in this context — it is a prop (see Task 7).

- [ ] **Step 1: Create the provider**

`src/hooks/contexts/active-boards-context.tsx`:
```typescript
'use client';

import React, {
  createContext, useContext, useState, useEffect, useCallback, ReactNode,
} from 'react';
import type { Bill } from '@/types/legislation';
import type { PublicOrg } from '@/types/tenant';
import { data } from '@/lib/data-client';

const LAST_ORG_KEY = 'activeBoardsLastOrgId';

interface ActiveBoardsContextType {
  followedOrgs: PublicOrg[];
  refreshFollowed: () => Promise<void>;
  selectedOrgId: string | null;
  selectOrg: (tenantId: string) => void;
  bills: Bill[];
  loadingBills: boolean;
  testimonyBillIds: Set<string>;
  follow: (tenantId: string) => Promise<void>;
  unfollow: (tenantId: string) => Promise<void>;
}

const ActiveBoardsContext = createContext<ActiveBoardsContextType | undefined>(undefined);

export function ActiveBoardsProvider({ children }: { children: ReactNode }) {
  const [followedOrgs, setFollowedOrgs] = useState<PublicOrg[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [testimonyBillIds, setTestimonyBillIds] = useState<Set<string>>(new Set());

  const refreshFollowed = useCallback(async () => {
    const orgs = await data.boards.listFollowed();
    setFollowedOrgs(orgs);
    // Reconcile selection: keep current if still followed, else restore
    // localStorage, else fall back to the first followed org.
    setSelectedOrgId((prev) => {
      if (prev && orgs.some((o) => o.tenantId === prev)) return prev;
      const saved = typeof window !== 'undefined' ? localStorage.getItem(LAST_ORG_KEY) : null;
      if (saved && orgs.some((o) => o.tenantId === saved)) return saved;
      return orgs[0]?.tenantId ?? null;
    });
  }, []);

  useEffect(() => {
    refreshFollowed();
  }, [refreshFollowed]);

  const selectOrg = useCallback((tenantId: string) => {
    setSelectedOrgId(tenantId);
    if (typeof window !== 'undefined') localStorage.setItem(LAST_ORG_KEY, tenantId);
  }, []);

  // Refetch bills + org testimony whenever the selected org changes.
  useEffect(() => {
    if (!selectedOrgId) {
      setBills([]);
      setTestimonyBillIds(new Set());
      return;
    }
    let cancelled = false;
    setLoadingBills(true);
    (async () => {
      try {
        const fetched = await data.boards.getBoard({ tenantId: selectedOrgId, showArchived: false });
        if (cancelled) return;
        setBills(fetched);
        const ids = await data.boards.getOrgTestimonyStatus({
          tenantId: selectedOrgId,
          billIds: fetched.map((b) => b.id),
        });
        if (cancelled) return;
        setTestimonyBillIds(new Set(ids));
      } catch (e) {
        if (!cancelled) {
          setBills([]);
          setTestimonyBillIds(new Set());
          console.error('Failed to load active board:', e);
        }
      } finally {
        if (!cancelled) setLoadingBills(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedOrgId]);

  const follow = useCallback(async (tenantId: string) => {
    await data.boards.follow({ tenantId });
    await refreshFollowed();
  }, [refreshFollowed]);

  const unfollow = useCallback(async (tenantId: string) => {
    await data.boards.unfollow({ tenantId });
    await refreshFollowed();
  }, [refreshFollowed]);

  return (
    <ActiveBoardsContext.Provider
      value={{
        followedOrgs, refreshFollowed, selectedOrgId, selectOrg,
        bills, loadingBills, testimonyBillIds, follow, unfollow,
      }}
    >
      {children}
    </ActiveBoardsContext.Provider>
  );
}

export function useActiveBoards() {
  const ctx = useContext(ActiveBoardsContext);
  if (ctx === undefined) {
    throw new Error('useActiveBoards must be used within an ActiveBoardsProvider');
  }
  return ctx;
}
```

- [ ] **Step 2: Typecheck & commit**

Run: `npm run typecheck`
Expected: PASS
```bash
git add src/hooks/contexts/active-boards-context.tsx
git commit -m "feat: add ActiveBoardsProvider context"
```

---

### Task 6: Pure display-rule helper + tests

**Files:**
- Create: `src/lib/board-display.ts`
- Test: `src/lib/__tests__/board-display.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type BoardMode = 'own' | 'active-boards';
  export interface CardVisibility {
    showTestimonyAlert: boolean;
    showTrackedCount: boolean;
    showLlmActions: boolean;
    showRemoveAssign: boolean;
    showTrackForSelf: boolean;
  }
  export function cardVisibility(mode: BoardMode): CardVisibility;
  ```

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/board-display.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { cardVisibility } from '@/lib/board-display';

describe('cardVisibility', () => {
  it('own mode shows all owner controls', () => {
    expect(cardVisibility('own')).toEqual({
      showTestimonyAlert: true,
      showTrackedCount: true,
      showLlmActions: true,
      showRemoveAssign: true,
      showTrackForSelf: false,
    });
  });

  it('active-boards mode hides owner controls and enables track-for-self', () => {
    expect(cardVisibility('active-boards')).toEqual({
      showTestimonyAlert: false,
      showTrackedCount: false,
      showLlmActions: false,
      showRemoveAssign: false,
      showTrackForSelf: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/board-display.test.ts`
Expected: FAIL — cannot resolve `@/lib/board-display`.

- [ ] **Step 3: Write the implementation**

`src/lib/board-display.ts`:
```typescript
export type BoardMode = 'own' | 'active-boards';

export interface CardVisibility {
  showTestimonyAlert: boolean;
  showTrackedCount: boolean;
  showLlmActions: boolean;
  showRemoveAssign: boolean;
  showTrackForSelf: boolean;
}

/**
 * What controls a bill card renders, by board surface. Active Boards is a
 * read-only view of another org's board: owner-only controls are hidden and a
 * single "track into my own context" action is enabled instead.
 */
export function cardVisibility(mode: BoardMode): CardVisibility {
  const activeBoards = mode === 'active-boards';
  return {
    showTestimonyAlert: !activeBoards,
    showTrackedCount: !activeBoards,
    showLlmActions: !activeBoards,
    showRemoveAssign: !activeBoards,
    showTrackForSelf: activeBoards,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/board-display.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/board-display.ts src/lib/__tests__/board-display.test.ts
git commit -m "feat: add board-display card-visibility helper"
```

---

### Task 7: Thread `boardMode` through KanbanBoard → Column → Card

**Files:**
- Modify: `src/components/kanban/kanban-board.tsx` (`KanbanBoardProps`, line ~23; propagate to `KanbanColumn`)
- Modify: `src/components/kanban/kanban-column.tsx` (`KanbanColumnProps`, line ~34; propagate to `KanbanCard`; gate temp-cards)
- Modify: `src/components/kanban/kanban-card.tsx` (`KanbanCardProps`, line ~33; apply `cardVisibility`)

**Interfaces:**
- Consumes: `BoardMode`, `cardVisibility` from `@/lib/board-display` (Task 6).
- Produces: all three components accept `boardMode?: BoardMode` (default `'own'`); `KanbanCard` additionally accepts `orgTestimonyState?: 'submitted' | undefined` and `onTrackForSelf?: (bill: Bill) => void`.

- [ ] **Step 1: Add `boardMode` to `KanbanBoardProps` and forward it**

In `src/components/kanban/kanban-board.tsx`, extend the interface (~line 23):
```typescript
interface KanbanBoardProps {
  readOnly: boolean;
  onUnadopt?: (billId: string) => void;
  showUnadoptButton?: boolean;
  boardMode?: import('@/lib/board-display').BoardMode;
  orgTestimonyBillIds?: Set<string>;
  onTrackForSelf?: (bill: import('@/types/legislation').Bill) => void;
}
```
Destructure with default in the component signature (~line 29):
```typescript
export function KanbanBoard({ readOnly, onUnadopt, showUnadoptButton = false, boardMode = 'own', orgTestimonyBillIds, onTrackForSelf }: KanbanBoardProps) {
```
Where the board renders each `<KanbanColumn ... />`, forward:
```tsx
boardMode={boardMode}
orgTestimonyBillIds={orgTestimonyBillIds}
onTrackForSelf={onTrackForSelf}
```

- [ ] **Step 2: Add `boardMode` to `KanbanColumnProps`, forward to card, gate temp-cards**

In `src/components/kanban/kanban-column.tsx` extend `KanbanColumnProps` (~line 34):
```typescript
  boardMode?: import('@/lib/board-display').BoardMode;
  orgTestimonyBillIds?: Set<string>;
  onTrackForSelf?: (bill: import('@/types/legislation').Bill) => void;
```
Destructure with `boardMode = 'own'`. Where each `<KanbanCard ... />` renders, forward:
```tsx
boardMode={boardMode}
orgTestimonyState={orgTestimonyBillIds?.has(bill.id) ? 'submitted' : undefined}
onTrackForSelf={onTrackForSelf}
```
Guard the pending-proposal temp-card block (the section that renders `TempBillCard` when `pendingCount > 0`, ~lines 223-237) so it is skipped in active-boards mode:
```tsx
{boardMode !== 'active-boards' && pendingCount > 0 && (
  /* ...existing temp-card rendering... */
)}
```

- [ ] **Step 3: Apply `cardVisibility` in `KanbanCard`**

In `src/components/kanban/kanban-card.tsx`:

Add to `KanbanCardProps` (~line 33):
```typescript
  boardMode?: import('@/lib/board-display').BoardMode;
  orgTestimonyState?: 'submitted' | undefined;
  onTrackForSelf?: (bill: Bill) => void;
```
Destructure with `boardMode = 'own', orgTestimonyState, onTrackForSelf` in the component (~line 43).

Import and compute visibility near the top of the component body:
```typescript
import { cardVisibility } from '@/lib/board-display';
// ...inside component, after existing hooks:
const vis = cardVisibility(boardMode);
```

Adjust the existing card sections (do NOT remove the `useBills()`/`useAuth()` calls — hooks must stay unconditional):
- **Testimony state source (~line 102):** use the org-level status in active-boards mode:
  ```typescript
  const testimonyState = boardMode === 'active-boards' ? orgTestimonyState : testimonyStatuses[bill.id];
  ```
- **Testimony DUE alert badge (~lines 260-272):** wrap the existing block in `{vis.showTestimonyAlert && ( ... )}`.
- **Tracked count / Users icon (~lines 276-280):** change the existing `canSeeTracking`/admin gate to `{vis.showTrackedCount && canSeeTracking && ( ... )}`.
- **LLM Accept/Reject buttons (~lines 312-336):** add `vis.showLlmActions &&` to the existing render condition.
- **Assign + Remove (X) controls (~lines within 157-221):** add `vis.showRemoveAssign &&` to their existing render conditions.
- **Track-for-self action:** add, in the card footer, shown only in active-boards mode:
  ```tsx
  {vis.showTrackForSelf && (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onTrackForSelf?.(bill); }}
      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
    >
      Track this bill
    </button>
  )}
  ```

- [ ] **Step 4: Verify `'own'` behavior is unchanged**

Run: `npm run build`
Expected: PASS. Manually confirm the `/` board still shows the testimony alert, tracked count (admin), LLM buttons, and remove/assign — i.e. every `vis.*` is `true` under the default `'own'` mode.

- [ ] **Step 5: Commit**

```bash
git add src/components/kanban/kanban-board.tsx src/components/kanban/kanban-column.tsx src/components/kanban/kanban-card.tsx
git commit -m "feat: thread boardMode through kanban board/column/card"
```

---

### Task 8: Hide "Tracked By" in bill-details dialog for active-boards

**Files:**
- Modify: `src/components/kanban/bill-details-dialog.tsx` (`canSeeTracking`, line ~119; "Tracked By" section, lines ~441-457)

**Interfaces:**
- Consumes: `BoardMode`.
- Produces: dialog accepts `boardMode?: BoardMode` (default `'own'`).

- [ ] **Step 1: Add `boardMode` prop and force tracking off**

In `bill-details-dialog.tsx`, add `boardMode?: import('@/lib/board-display').BoardMode` to its props interface, destructure with `boardMode = 'own'`. Change the tracking gate (~line 119) from:
```typescript
const canSeeTracking = activeTenant?.orgRole === 'admin';
```
to:
```typescript
const canSeeTracking = boardMode !== 'active-boards' && activeTenant?.orgRole === 'admin';
```

- [ ] **Step 2: Typecheck & commit**

Run: `npm run typecheck`
Expected: PASS
```bash
git add src/components/kanban/bill-details-dialog.tsx
git commit -m "feat: hide tracked-by in active-boards bill details"
```

---

### Task 9: Active Boards sub-nav + header wiring

**Files:**
- Create: `src/components/boards/active-boards-subnav.tsx`
- Modify: `src/components/main/header-subnav.tsx` (add `/boards` branch, ~line 34)

**Interfaces:**
- Produces: `ActiveBoardsSubNav` with tabs "View Board" (`/boards`) and "Browse Orgs" (`/boards/browse`), matching `TestimoniesSubNav` styling, with `compact` variant.

- [ ] **Step 1: Create `active-boards-subnav.tsx`**

Model on `TestimoniesSubNav` (link-based tabs, `bg-secondary` pill, active = `bg-primary text-white`, `compact` = icon-only). No counts.
```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KanbanSquareIcon, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/boards', label: 'View Board', icon: KanbanSquareIcon },
  { href: '/boards/browse', label: 'Browse Orgs', icon: Building2 },
] as const;

function isTabActive(href: string, pathname: string) {
  return href === '/boards' ? pathname === '/boards' : pathname.startsWith(href);
}

export function ActiveBoardsSubNav({ compact = false, className }: { compact?: boolean; className?: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Active board views"
      className={cn('inline-flex h-10 items-center rounded-md bg-secondary p-1 shadow-sm', className)}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isTabActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-sm py-1.5 text-sm font-medium transition-all',
              compact ? 'px-2' : 'px-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
              active ? 'bg-primary text-white shadow-sm' : 'text-secondary-foreground hover:bg-white/50',
            )}
          >
            <Icon className={cn(compact ? 'h-5 w-5' : 'h-4 w-4 mr-2')} />
            {!compact && label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Add `/boards` branch to `header-subnav.tsx`**

Import `ActiveBoardsSubNav`, and before the final `return null;` add:
```tsx
  if (pathname.startsWith('/boards') && user) {
    return (
      <>
        <div className="hidden md:block">
          <ActiveBoardsSubNav />
        </div>
        <div className="md:hidden flex justify-center">
          <ActiveBoardsSubNav compact />
        </div>
      </>
    );
  }
```
Also update the file's doc comment: `/boards` now renders its sub-nav (was "renders nothing yet").

- [ ] **Step 3: Typecheck & commit**

Run: `npm run typecheck`
Expected: PASS
```bash
git add src/components/boards/active-boards-subnav.tsx src/components/main/header-subnav.tsx
git commit -m "feat: add Active Boards sub-nav"
```

---

### Task 10: Browse Orgs list + page

**Files:**
- Create: `src/components/boards/browse-orgs-list.tsx`
- Create: `src/app/(main)/boards/browse/page.tsx`

**Interfaces:**
- Consumes: `useActiveBoards()` (Task 5) for `follow`/`unfollow`; `data.boards.listPublicOrgs()` for the full list.
- Produces: Browse Orgs UI listing all public orgs with Follow/Unfollow buttons.

- [ ] **Step 1: Create `browse-orgs-list.tsx`**

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import type { PublicOrg } from '@/types/tenant';
import { data } from '@/lib/data-client';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';

export function BrowseOrgsList() {
  const [orgs, setOrgs] = useState<PublicOrg[] | null>(null);
  const { follow, unfollow, refreshFollowed } = useActiveBoards();
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await data.boards.listPublicOrgs();
    setOrgs(list);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (org: PublicOrg) => {
    setBusyId(org.tenantId);
    try {
      if (org.isFollowing) await unfollow(org.tenantId);
      else await follow(org.tenantId);
      await Promise.all([load(), refreshFollowed()]);
    } finally {
      setBusyId(null);
    }
  };

  if (orgs === null) return <p className="text-sm text-muted-foreground">Loading organizations…</p>;
  if (orgs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <Building2 className="h-8 w-8" />
        <p className="text-sm">No organizations have made their board public yet.</p>
      </div>
    );
  }

  return (
    <ul className="mx-auto w-full max-w-2xl divide-y rounded-md border">
      {orgs.map((org) => (
        <li key={org.tenantId} className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="truncate font-medium">{org.name}</p>
          </div>
          <Button
            variant={org.isFollowing ? 'outline' : 'default'}
            size="sm"
            disabled={busyId === org.tenantId}
            onClick={() => toggle(org)}
          >
            {org.isFollowing ? 'Following' : 'Follow'}
          </Button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Create the Browse page**

`src/app/(main)/boards/browse/page.tsx`:
```typescript
import { BrowseOrgsList } from '@/components/boards/browse-orgs-list';

export default function BrowseOrgsPage() {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h1 className="sr-only">Browse organizations</h1>
      <BrowseOrgsList />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck & commit**

Run: `npm run typecheck`
Expected: PASS
```bash
git add src/components/boards/browse-orgs-list.tsx "src/app/(main)/boards/browse/page.tsx"
git commit -m "feat: add Browse Orgs list and page"
```

---

### Task 11: Org-switcher dropdown + View Board view + page

**Files:**
- Create: `src/components/boards/org-switcher-dropdown.tsx`
- Create: `src/components/boards/active-board-view.tsx`
- Create: `src/components/boards/active-boards-bills-bridge.tsx`
- Modify: `src/hooks/contexts/bills-context.tsx` (export `BillsContext` + `BillsContextType`)
- Modify: `src/app/(main)/boards/page.tsx` (replace placeholder)
- Create: `src/app/(main)/boards/layout.tsx` (wraps `/boards/*` in `ActiveBoardsProvider`)

**Notes:**
- `KanbanBoard` filter/search state comes from the global `useKanbanBoard()` context (shared with `/`). This is acceptable — it resets on navigation; do not add a second `KanbanBoardProvider`.
- `readOnly` on `KanbanBoard` already disables drag-and-drop and mutation affordances; combined with `boardMode="active-boards"` the board is fully read-only.

**Interfaces:**
- Consumes: `useActiveBoards()`; `KanbanBoard` with `boardMode="active-boards"`; `data.bills.getBills`-style track via existing `trackBill` (through `/api/bills` POST). Track-for-self posts `{ tenantId: viewerActiveTenantId, billUrl: bill.url }` to `/api/bills`.
- Produces: the View Board tab: filter box + tag filters + org dropdown + read-only board, or the empty state.

- [ ] **Step 1: Create `/boards` layout wrapping the provider**

`src/app/(main)/boards/layout.tsx`:
```typescript
import { ActiveBoardsProvider } from '@/hooks/contexts/active-boards-context';

export default function BoardsLayout({ children }: { children: React.ReactNode }) {
  return <ActiveBoardsProvider>{children}</ActiveBoardsProvider>;
}
```

- [ ] **Step 2: Create `org-switcher-dropdown.tsx`**

Dropdown listing ONLY `followedOrgs`; selecting calls `selectOrg`. Uses the existing shadcn dropdown-menu.
```typescript
'use client';

import { ChevronDown } from 'lucide-react';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export function OrgSwitcherDropdown() {
  const { followedOrgs, selectedOrgId, selectOrg } = useActiveBoards();
  const current = followedOrgs.find((o) => o.tenantId === selectedOrgId);
  if (followedOrgs.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <span className="max-w-[12rem] truncate">Viewing: {current?.name ?? 'Select org'}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={selectedOrgId ?? ''} onValueChange={selectOrg}>
          {followedOrgs.map((o) => (
            <DropdownMenuRadioItem key={o.tenantId} value={o.tenantId} className="cursor-pointer">
              {o.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Create `active-board-view.tsx`**

Renders: empty state when no follows; otherwise a header (filter box + `TagFilterList` + `OrgSwitcherDropdown`) and the read-only `KanbanBoard`. Because `KanbanBoard` reads bills from `useBills()`, and Active Boards data lives in `useActiveBoards()`, this view builds its own filtered bill set and passes it via a thin local BillsProvider-shaped wrapper OR renders columns directly. Per the architecture decision, we mount the read-only `KanbanBoard` inside a scoped `BillsProvider`-compatible bridge. To keep this task self-contained, use the following bridge:

Create `src/components/boards/active-boards-bills-bridge.tsx`:
```typescript
'use client';

// Bridges ActiveBoardsContext data into the shape KanbanBoard/Card read from
// useBills(). Active Boards is read-only, so mutating members are no-ops.
import React from 'react';
import { BillsContext, type BillsContextType } from '@/hooks/contexts/bills-context';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';

export function ActiveBoardsBillsBridge({ children }: { children: React.ReactNode }) {
  const { bills, loadingBills } = useActiveBoards();
  const asyncNoop = async () => {};
  // Mirrors the EXACT BillsContextType (verified in bills-context.tsx during
  // planning — 30 fields). Active Boards passes boardMode="active-boards", so
  // the card hides all mutating controls and none of these no-ops ever fire.
  const value: BillsContextType = {
    // State
    loadingBills,
    setLoadingBills: () => {},
    bills,
    setBills: () => {},
    tempBills: [],
    setTempBills: () => {},
    // LLM Suggestion Controls
    acceptLLMChange: asyncNoop,
    rejectLLMChange: asyncNoop,
    rejectAllLLMChanges: asyncNoop,
    acceptAllLLMChanges: asyncNoop,
    // Human Proposal Controls
    proposeStatusChange: asyncNoop,
    acceptTempChange: asyncNoop,
    rejectTempChange: asyncNoop,
    acceptAllTempChanges: asyncNoop,
    rejectAllTempChanges: asyncNoop,
    undoProposal: asyncNoop,
    // View Mode
    viewMode: 'all-bills',
    setViewMode: () => {},
    toggleViewMode: () => {},
    // Archived Toggle
    showArchived: false,
    setShowArchived: () => {},
    toggleShowArchived: () => {},
    // Bill CRUD
    addBill: () => {},
    updateBill: () => {},
    removeBill: () => {},
    // Data Operations
    resetBills: asyncNoop,
    refreshBills: asyncNoop,
    // Testimony progress (current user)
    testimonyStatuses: {},
    refreshTestimonyStatuses: asyncNoop,
  };
  return <BillsContext.Provider value={value}>{children}</BillsContext.Provider>;
}
```

> IMPLEMENTATION NOTES:
> 1. `BillsContext` is currently NOT exported from `src/hooks/contexts/bills-context.tsx` (line ~74: `const BillsContext = createContext<BillsContextType | undefined>(undefined)`). Add `export` to it, and export the `BillsContextType` interface too (change `interface BillsContextType` → `export interface BillsContextType`). Import both here: `import { BillsContext, type BillsContextType } from '@/hooks/contexts/bills-context'`.
> 2. The `value` above mirrors the `BillsContextType` fields verified during planning. If the interface has drifted, reconcile field-for-field — TypeScript will flag any missing member since `value` is typed `BillsContextType` (no `as any`). This is the whole point of typing it: the compiler enforces the mirror.
> 3. `proposeStatusChange` has a non-trivial signature `(bill, suggested_status, meta) => Promise<void>`; `asyncNoop` (an `async () => {}`) is assignable to it because it ignores its args. Same for the other typed callbacks.

Then `active-board-view.tsx`:
```typescript
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { TagFilterList } from '@/components/tags/tag-filter-list';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OrgSwitcherDropdown } from './org-switcher-dropdown';
import { ActiveBoardsBillsBridge } from './active-boards-bills-bridge';
import { data } from '@/lib/data-client';
import { useAuth } from '@/hooks/contexts/auth-context';
import { toast } from '@/hooks/use-toast';
import type { Bill } from '@/types/legislation';

export function ActiveBoardView() {
  const { followedOrgs, testimonyBillIds, loadingBills } = useActiveBoards();
  const { searchQuery, setSearchQuery } = useKanbanBoard();
  const { activeTenant } = useAuth();

  const handleTrackForSelf = async (bill: Bill) => {
    try {
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: activeTenant?.tenantId, billUrl: bill.url }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Bill tracked', description: `${bill.bill_number} added to your board.`, duration: 4000 });
    } catch {
      toast({ title: 'Could not track bill', description: 'Please try again.', variant: 'destructive', duration: 5000 });
    }
  };

  if (followedOrgs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <LayoutGrid className="h-10 w-10" />
        <p className="text-base font-medium text-foreground">No boards yet</p>
        <p className="text-sm">Follow an organization to see its board here.</p>
        <Button asChild size="sm"><Link href="/boards/browse">Browse Orgs</Link></Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 p-2 md:p-4">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter this board…"
          className="h-9 max-w-xs"
        />
        <TagFilterList />
        <div className="ml-auto"><OrgSwitcherDropdown /></div>
      </div>
      <ActiveBoardsBillsBridge>
        <KanbanBoard
          readOnly
          boardMode="active-boards"
          orgTestimonyBillIds={testimonyBillIds}
          onTrackForSelf={handleTrackForSelf}
        />
      </ActiveBoardsBillsBridge>
    </div>
  );
}
```

> NOTE on `TagFilterList`: it reads tags/years from bills in context and writes to `useKanbanBoard()` filter state — reused as-is (read-only; skip rendering its tag-management gear if it is admin-gated already, which it is). Confirm it does not require membership.

- [ ] **Step 4: Replace `/boards/page.tsx`**

`src/app/(main)/boards/page.tsx`:
```typescript
import { ActiveBoardView } from '@/components/boards/active-board-view';

export default function BoardsPage() {
  return <ActiveBoardView />;
}
```

- [ ] **Step 5: Build & commit**

Run: `npm run build`
Expected: PASS.
```bash
git add src/components/boards/org-switcher-dropdown.tsx src/components/boards/active-board-view.tsx src/components/boards/active-boards-bills-bridge.tsx src/hooks/contexts/bills-context.tsx "src/app/(main)/boards/page.tsx" "src/app/(main)/boards/layout.tsx"
git commit -m "feat: add Active Boards View Board tab with org switcher"
```

---

### Task 12: Org Settings dialog (admin) + public_board wiring

**Files:**
- Create: `src/components/admin/org-settings-dialog.tsx`
- Modify: `src/app/api/tenants/[id]/route.ts` (PATCH accepts `public_board`)
- Modify: `src/components/auth/user-menu.tsx` (add admin-only "Org Settings" item)
- Modify: `src/app/actions/boards.ts` (add `setPublicBoardAction`) + `src/lib/data-client/boards.client.ts` + params

**Interfaces:**
- Consumes: `setPublicBoard` (Task 2); `requireAdmin`; `useAuth().activeTenant`.
- Produces: `data.boards.getOrgSettings({tenantId})` → `{ publicBoard: boolean }`, `data.boards.setPublicBoard({tenantId, enabled})` → `void`.

- [ ] **Step 1: Extend the tenants PATCH route**

In `src/app/api/tenants/[id]/route.ts` PATCH, after reading `body`, handle `public_board`:
```typescript
const { brandingConfig, public_board } = body;
const patch: Record<string, unknown> = {};
if (brandingConfig !== undefined) patch.branding_config = brandingConfig ? JSON.stringify(brandingConfig) : null;
if (public_board !== undefined) patch.public_board = public_board;
const tenant = await db
  .updateTable('tenants')
  .set(patch)
  .where('id', '=', id)
  .returningAll()
  .executeTakeFirst();
```
(Keeps existing `requireAdmin.fromRequest(request, id)` guard.)

- [ ] **Step 2: Add settings actions + client op + params**

Append param type to `src/lib/data-client/boards.params.ts`:
```typescript
export interface SetPublicBoardParams { tenantId: string; enabled: boolean; }
export interface OrgSettingsParams { tenantId: string; }
```
Append to `src/app/actions/boards.ts`:
```typescript
import { requireAdmin } from '@/lib/auth-guards';
import { setPublicBoard } from '@/db/queries/tenants';
import { db } from '@/db/kysely/client';
import type { SetPublicBoardParams, OrgSettingsParams } from '@/lib/data-client/boards.params';

export async function getOrgSettingsAction(params: OrgSettingsParams): Promise<{ publicBoard: boolean }> {
  await requireAdmin.fromAction(params.tenantId);
  const row = await db.selectFrom('tenants').select('public_board').where('id', '=', params.tenantId).executeTakeFirst();
  return { publicBoard: row?.public_board ?? false };
}

export async function setPublicBoardAction(params: SetPublicBoardParams): Promise<void> {
  await requireAdmin.fromAction(params.tenantId);
  await setPublicBoard(params.tenantId, params.enabled);
}
```
> NOTE: `getOrgSettingsAction` reads a single column inline; if the repo forbids inline `db.*` in actions strictly, add a `getTenantPublicBoard(tenantId)` query to `tenants.ts` and call it instead. Prefer the query function.

Append fetch arms + registrations in `boards.client.ts`:
```typescript
async function getOrgSettingsFetch(params: OrgSettingsParams): Promise<{ publicBoard: boolean }> {
  const res = await fetch(`/api/tenants/${params.tenantId}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load org settings');
  const { tenant } = await res.json();
  return { publicBoard: Boolean(tenant?.public_board) };
}
async function setPublicBoardFetch(params: SetPublicBoardParams): Promise<void> {
  const res = await fetch(`/api/tenants/${params.tenantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_board: params.enabled }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save org settings');
}
```
Add to the `defineClient('boards', { ... })` map:
```typescript
  getOrgSettings: { action: getOrgSettingsAction, fetch: getOrgSettingsFetch },
  setPublicBoard: { action: setPublicBoardAction, fetch: setPublicBoardFetch },
```
Add the imports for the new actions at the top of `boards.client.ts`.

- [ ] **Step 3: Create `org-settings-dialog.tsx`**

Model on `SettingsDialog` (Dialog + Switch + Label). Loads current value on open via `data.boards.getOrgSettings`, saves via `data.boards.setPublicBoard`.
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export function OrgSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeTenant } = useAuth();
  const tenantId = activeTenant?.tenantId;
  const [publicBoard, setPublicBoard] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    data.boards.getOrgSettings({ tenantId })
      .then((s) => { if (!cancelled) setPublicBoard(s.publicBoard); })
      .catch(() => { if (!cancelled) setPublicBoard(false); });
    return () => { cancelled = true; };
  }, [open, tenantId]);

  const handleToggle = async (checked: boolean) => {
    if (!tenantId) return;
    setSaving(true);
    setPublicBoard(checked);
    try {
      await data.boards.setPublicBoard({ tenantId, enabled: checked });
    } catch {
      setPublicBoard(!checked);
      toast({ title: 'Could not save setting', description: 'Please try again.', variant: 'destructive', duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Org Settings</DialogTitle>
          <DialogDescription>Manage settings for {activeTenant?.name}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="public-board" className="text-sm font-medium">Public board visibility</Label>
            <Switch
              id="public-board"
              disabled={publicBoard === null || saving}
              checked={publicBoard ?? false}
              onCheckedChange={handleToggle}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            When on, anyone can view this org's board (read-only) under Active Boards.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Add "Org Settings" to the user menu (admin only)**

In `src/components/auth/user-menu.tsx`: import `OrgSettingsDialog`, add `const [orgSettingsOpen, setOrgSettingsOpen] = useState(false);` and an opener callback mirroring `openSettingsDialog`. Inside the `activeTenant?.orgRole === 'admin'` block (next to Invite User), add a `DropdownMenuItem` "Org Settings" that opens it. Render `<OrgSettingsDialog open={orgSettingsOpen} onOpenChange={setOrgSettingsOpen} />` alongside the other dialogs.

- [ ] **Step 5: Build & commit**

Run: `npm run build`
Expected: PASS (verifies `'use server'` file still exports only async functions).
```bash
git add src/components/admin/org-settings-dialog.tsx "src/app/api/tenants/[id]/route.ts" src/components/auth/user-menu.tsx src/app/actions/boards.ts src/lib/data-client/boards.client.ts src/lib/data-client/boards.params.ts
git commit -m "feat: add admin Org Settings dialog with public board toggle"
```

---

### Task 13: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test + type + build gate**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS. Tests include the new `board-display.test.ts` (2 tests).

- [ ] **Step 2: Manual smoke (dev server)**

Run: `npm run dev` then verify in-browser:
1. As an org admin: open user menu → Org Settings → toggle Public board visibility ON.
2. As any user (can be a different account or same): go to Active Boards → Browse Orgs → the opted-in org appears → Follow it.
3. Switch to View Board → the org's board renders read-only: no testimony alert badge, no Users icon/count, no LLM buttons, no remove/assign, no temp-cards. Tags + tag filtering work. Bills with org testimony show the "testimony written" chip.
4. Open a bill's details → no "Tracked By" section.
5. Click "Track this bill" → toast confirms it was added to the viewer's own board (check on `/`).
6. Toggle the org's visibility OFF → it disappears from Browse Orgs and the switcher; viewing its board 404s gracefully (empty).
7. Confirm the normal `/` board is unchanged (alert badge, tracked count, LLM, remove/assign all present).

- [ ] **Step 3: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "fix: Active Boards verification fixups"
```

---

## Self-Review

**1. Spec coverage:**
- Nav/two-tab structure → Task 9 (subnav), 10 (Browse), 11 (View Board). ✓
- URL-segment tab state → `/boards` + `/boards/browse` pages (Tasks 10, 11). ✓
- Empty state → Task 11 Step 3. ✓
- Filter box "Filter this board…" (not "Search") → Task 11. ✓
- Tag filtering reused read-only → Task 11 (`TagFilterList`). ✓
- Org-switcher dropdown, followed-only → Task 11 Step 2. ✓
- Read-only card rules (hide alert/Users/LLM/temp-cards, keep testimony-written chip + track-for-self) → Tasks 6, 7. ✓
- Bill details hides Tracked By → Task 8. ✓
- Org Settings dialog, admin-only, default OFF → Task 12. ✓
- Migrations `public_board` + `org_follows` → Task 1. ✓
- Authorization: `requireSession` + public gate, member path untouched → Task 3 (all boards actions/routes use `requireSession` + `getPublicTenant`). ✓
- `boards` data-client domain → Task 4. ✓
- `ActiveBoardsProvider`, refetch on switch, separate from BillsProvider → Task 5. ✓
- Track-this-bill uses existing `trackBill` via `bill.url` → Task 11 Step 3 (POST /api/bills). ✓
- `boardMode` default `'own'`, existing views unchanged → Tasks 6, 7 Step 4. ✓

**2. Placeholder scan:** No "TBD/implement later". Two explicit IMPLEMENTATION NOTEs (Errors helper name; BillsContext shape) direct the engineer to verify an exact name/shape against a named file before writing — these are verification instructions, not placeholders, because the surrounding code is fully specified.

**3. Type consistency:** `PublicOrg` defined once in `src/types/tenant.ts` (Task 2), imported everywhere. `BoardMode`/`cardVisibility` defined in Task 6, consumed by Tasks 7, 8. Action signatures in Task 3 match param types in `boards.params.ts` and the client arms in Tasks 4, 12. `getBoardAction` uses `getAllTrackedBills(showArchived, tenantId, false)` consistent with `bills-read.ts`. `data.boards.*` op names (`listPublicOrgs`, `listFollowed`, `follow`, `unfollow`, `getBoard`, `getOrgTestimonyStatus`, `getOrgSettings`, `setPublicBoard`) are consistent between `boards.client.ts` and all callers.
