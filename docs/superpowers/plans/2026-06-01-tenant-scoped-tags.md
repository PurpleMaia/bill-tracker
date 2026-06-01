# Tenant-Scoped Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix cross-organization tag visibility by enforcing tenant scoping at every layer — database, service, components, and API routes.

**Architecture:** Add NOT NULL constraint on `tags.tenant_id` (backfilling existing NULL rows with Food+ tenant ID), make `tenantId` a required parameter in all tag service functions, update all components to pass `activeTenant.tenantId`, and fix API routes to enforce tenant filtering.

**Tech Stack:** PostgreSQL (migration), Kysely, Next.js App Router, React, TypeScript

---

### Task 1: Database Migration — Enforce NOT NULL on tags.tenant_id

**Files:**
- Create: `src/db/migrations/000019_enforce-tags-tenant-id.up.sql`
- Create: `src/db/migrations/000019_enforce-tags-tenant-id.down.sql`

- [ ] **Step 1: Write the up migration**

```sql
-- Backfill any tags that still have NULL tenant_id with Food+ tenant
UPDATE tags
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'food-plus')
WHERE tenant_id IS NULL;

-- Enforce NOT NULL on tenant_id
ALTER TABLE tags
    ALTER COLUMN tenant_id SET NOT NULL;
```

- [ ] **Step 2: Write the down migration**

```sql
-- Revert NOT NULL constraint
ALTER TABLE tags
    ALTER COLUMN tenant_id DROP NOT NULL;
```

- [ ] **Step 3: Run the migration**

Run: `npm run migrate:up`
Expected: Migration completes successfully, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/000019_enforce-tags-tenant-id.up.sql src/db/migrations/000019_enforce-tags-tenant-id.down.sql
git commit -m "feat: enforce NOT NULL on tags.tenant_id with Food+ backfill"
```

---

### Task 2: Update Tag Type — Add tenant_id to Tag interface

**Files:**
- Modify: `src/types/legislation.ts:113-119`
- Modify: `src/db/types.ts:150-157` (verify `tenant_id` is `string`, not `string | null`)

- [ ] **Step 1: Add tenant_id to the Tag interface**

In `src/types/legislation.ts`, update the `Tag` interface:

```typescript
export interface Tag {
  id: string;
  name: string;
  color?: string | null;
  tenant_id: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}
```

- [ ] **Step 2: Update Kysely DB type**

In `src/db/types.ts`, change the `Tags` interface `tenant_id` field from `string | null` to `string`:

```typescript
export interface Tags {
  color: string | null;
  created_at: Generated<Timestamp>;
  id: Generated<string>;
  name: string;
  tenant_id: string;
  updated_at: Generated<Timestamp>;
}
```

- [ ] **Step 3: Run typecheck to see what breaks**

Run: `npm run typecheck`
Expected: Type errors in service functions and components where `tenantId` is optional or missing. This is expected — we fix them in the next tasks.

- [ ] **Step 4: Commit**

```bash
git add src/types/legislation.ts src/db/types.ts
git commit -m "feat: add tenant_id to Tag interface, enforce non-null in DB types"
```

---

### Task 3: Update Tag Service — Make tenantId required

**Files:**
- Modify: `src/services/data/tags.ts`

All 7 exported functions need `tenantId` changed from optional (`tenantId?: string`) to required (`tenantId: string`). All `if (tenantId)` conditional guards are removed — every query always filters by `tenant_id`.

- [ ] **Step 1: Update `getAllTags`**

Replace the function signature and body. Remove the `if (tenantId)` guard — always filter:

```typescript
export async function getAllTags(tenantId: string): Promise<Tag[]> {
  try {
    const tags = await db
      .selectFrom('tags')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('name', 'asc')
      .execute();

    return tags as Tag[];
  } catch (error: any) {
    if (error?.message?.includes('does not exist') || error?.code === '42P01') {
      console.log('Tags table does not exist yet, returning empty array');
      return [];
    }
    console.error('Error fetching tags:', error);
    return [];
  }
}
```

- [ ] **Step 2: Update `createTag`**

Change signature to `createTag(name: string, color?: string, tenantId: string)`. Remove conditional guards:

```typescript
export async function createTag(name: string, color: string | undefined, tenantId: string): Promise<Tag> {
  try {
    console.log('Creating new tag:', name, 'for tenant:', tenantId.slice(0, 6), '...');
    const existingTag = await db
      .selectFrom('tags')
      .select('id')
      .where('name', '=', name.trim())
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (existingTag) {
      throw new Error('Tag with this name already exists');
    }

    const newTag = await db
      .insertInto('tags')
      .values({
        name: name.trim(),
        color: color || null,
        tenant_id: tenantId,
      })
      .returningAll()
      .executeTakeFirst();

    if (!newTag) {
      throw new Error('Failed to create tag');
    }

    return newTag as Tag;
  } catch (error) {
    console.error('Error creating tag:', error);
    throw error instanceof Error ? error : new Error('Failed to create tag');
  }
}
```

- [ ] **Step 3: Update `updateTag`**

Change signature to required `tenantId: string`. Remove all conditional guards:

```typescript
export async function updateTag(id: string, name: string, color: string | undefined, tenantId: string): Promise<Tag> {
  try {
    const existingTag = await db
      .selectFrom('tags')
      .select(['id', 'tenant_id'])
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (!existingTag) {
      throw new Error('Tag not found');
    }

    const duplicateTag = await db
      .selectFrom('tags')
      .select('id')
      .where('name', '=', name.trim())
      .where('id', '!=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (duplicateTag) {
      throw new Error('Tag with this name already exists');
    }

    const updatedTag = await db
      .updateTable('tags')
      .set({
        name: name.trim(),
        color: color || null,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirst();

    if (!updatedTag) {
      throw new Error('Failed to update tag');
    }

    return updatedTag as Tag;
  } catch (error) {
    console.error('Error updating tag:', error);
    throw error instanceof Error ? error : new Error('Failed to update tag');
  }
}
```

- [ ] **Step 4: Update `deleteTag`**

Change signature to required `tenantId: string`. Remove conditional guards:

```typescript
export async function deleteTag(id: string, tenantId: string): Promise<void> {
  try {
    const existingTag = await db
      .selectFrom('tags')
      .select('id')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (!existingTag) {
      throw new Error('Tag not found');
    }

    await db.deleteFrom('tags')
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .execute();
  } catch (error) {
    console.error('Error deleting tag:', error);
    throw error instanceof Error ? error : new Error('Failed to delete tag');
  }
}
```

- [ ] **Step 5: Update `getBillTags`**

Change signature to required `tenantId: string`. Remove conditional guard:

```typescript
export async function getBillTags(billId: string, tenantId: string): Promise<Tag[]> {
  try {
    const tags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.tenant_id',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .where('t.tenant_id', '=', tenantId)
      .orderBy('t.name', 'asc')
      .execute();

    return tags as Tag[];
  } catch (error) {
    console.error('Error fetching bill tags:', error);
    return [];
  }
}
```

- [ ] **Step 6: Update `getBatchBillTags`**

Change signature to required `tenantId: string`. Remove conditional guard. Add `t.tenant_id` to select:

```typescript
export async function getBatchBillTags(billIds: string[], tenantId: string): Promise<Record<string, Tag[]>> {
  try {
    if (!Array.isArray(billIds) || billIds.length === 0) {
      return {};
    }

    const billTags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        'bt.bill_id',
        't.id',
        't.name',
        't.color',
        't.tenant_id',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', 'in', billIds)
      .where('t.tenant_id', '=', tenantId)
      .orderBy('t.name', 'asc')
      .execute();

    const tagsByBillId = billTags.reduce((acc, row) => {
      if (!acc[row.bill_id]) {
        acc[row.bill_id] = [];
      }
      acc[row.bill_id].push({
        id: row.id,
        name: row.name,
        color: row.color,
        tenant_id: row.tenant_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } as Tag);
      return acc;
    }, {} as Record<string, Tag[]>);

    billIds.forEach(billId => {
      if (!tagsByBillId[billId]) {
        tagsByBillId[billId] = [];
      }
    });

    return tagsByBillId;
  } catch (error) {
    console.error('Error fetching batch bill tags:', error);
    return {};
  }
}
```

- [ ] **Step 7: Update `updateBillTags`**

Change signature to required `tenantId: string`. Remove the `if (tenantId) / else` branching — always scope to tenant. Add `t.tenant_id` to the final select:

```typescript
export async function updateBillTags(billId: string, tagIds: string[], tenantId: string): Promise<Tag[]> {
  try {
    console.log('Updating bill tags for billId:', billId.slice(0, 6), '...');
    const bill = await db
      .selectFrom('bills')
      .select('id')
      .where('id', '=', billId)
      .executeTakeFirst();

    if (!bill) {
      throw new Error('Bill not found');
    }

    // Remove existing tags for this bill that belong to this tenant
    await db
      .deleteFrom('bill_tags')
      .where('bill_id', '=', billId)
      .where('tag_id', 'in',
        db.selectFrom('tags').select('id').where('tenant_id', '=', tenantId)
      )
      .execute();

    if (tagIds.length > 0) {
      const validTags = await db
        .selectFrom('tags')
        .select('id')
        .where('id', 'in', tagIds)
        .where('tenant_id', '=', tenantId)
        .execute();

      if (validTags.length !== tagIds.length) {
        throw new Error('One or more tag IDs are invalid');
      }

      await db
        .insertInto('bill_tags')
        .values(
          tagIds.map((tagId: string) => ({
            bill_id: billId,
            tag_id: tagId,
          }))
        )
        .execute();
    }

    const updatedTags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.tenant_id',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .where('t.tenant_id', '=', tenantId)
      .orderBy('t.name', 'asc')
      .execute();

    return updatedTags as Tag[];
  } catch (error) {
    console.error('Error updating bill tags:', error);
    throw error instanceof Error ? error : new Error('Failed to update bill tags');
  }
}
```

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: Errors in components and callers that don't pass `tenantId` — this is expected and will be fixed in the next tasks.

- [ ] **Step 9: Commit**

```bash
git add src/services/data/tags.ts
git commit -m "feat: make tenantId required in all tag service functions"
```

---

### Task 4: Update Components — Pass tenantId, hide UI for public users

**Files:**
- Modify: `src/components/tags/tag-management-dialog.tsx`
- Modify: `src/components/tags/tag-selector.tsx`
- Modify: `src/components/tags/card-tag-selector.tsx`
- Modify: `src/components/tags/tag-filter-list.tsx`

- [ ] **Step 1: Update `tag-management-dialog.tsx`**

This component doesn't currently import `useAuth`. Add the import and extract `activeTenant`. Pass `activeTenant.tenantId` to all service calls. Return `null` from the dialog content if no active tenant.

Add import for `useAuth`:
```typescript
import { useAuth } from '@/hooks/contexts/auth-context';
```

Inside the component function, add:
```typescript
const { activeTenant } = useAuth();
```

Update `loadTags`:
```typescript
const loadTags = async () => {
    setLoading(true);
    try {
      if (!activeTenant) return;
      const fetchedTags = await getAllTags(activeTenant.tenantId);
      setTags(fetchedTags);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load tags',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
```

Update `handleCreateTag` — pass `tenantId`:
```typescript
const newTag = await createTag(newTagName.trim(), newTagColor, activeTenant!.tenantId);
```

Update `handleUpdateTag` — pass `tenantId`:
```typescript
const updatedTag = await updateTag(tag.id, tag.name.trim(), tag.color || undefined, activeTenant!.tenantId);
```

Update `handleDeleteTag` — pass `tenantId`:
```typescript
await deleteTag(tagId, activeTenant!.tenantId);
```

- [ ] **Step 2: Update `tag-selector.tsx`**

This component already imports `useAuth` and has `activeTenant`. Pass `activeTenant.tenantId` to service calls. Return null if no active tenant.

Add early return after the hooks:
```typescript
if (!activeTenant) return null;
```

Update `loadData`:
```typescript
const [tags, billTags] = await Promise.all([
  getAllTags(activeTenant.tenantId),
  getBillTags(billId, activeTenant.tenantId),
]);
```

Update `handleToggleTag`:
```typescript
const updatedTags = await updateBillTags(
  billId,
  newSelectedTags.map(t => t.id),
  activeTenant.tenantId
);
```

Add `activeTenant` to the `useEffect` dependency for `loadData`:
```typescript
useEffect(() => {
  loadData();
}, [billId, activeTenant]);
```

- [ ] **Step 3: Update `card-tag-selector.tsx`**

Already imports `useAuth` and has `activeTenant`. Pass `tenantId` to service calls. Return null if no active tenant.

Add early return after the hooks:
```typescript
if (!activeTenant) return null;
```

Update the `loadData` inside `useEffect`:
```typescript
const tags = await getAllTags(activeTenant.tenantId);
```

Update `handleToggleTag`:
```typescript
const updatedTags = await updateBillTags(
  billId,
  newSelectedTags.map(t => t.id),
  activeTenant.tenantId
);
```

- [ ] **Step 4: Update `tag-filter-list.tsx`**

Already imports `useAuth` and has `activeTenant`. Pass `tenantId` to service calls. Return null if no active tenant.

Add early return after the hooks (before the `useMemo`):
After the line `const canManageTags = activeTenant?.orgRole === 'admin';`, the component should check for tenant existence. However, since this component renders filter UI that shouldn't disappear entirely for non-tenant users (it also has year filters), we should only hide the tags section. Instead, update `loadTags` to skip fetching when no tenant:

Update `loadTags`:
```typescript
const loadTags = async () => {
  setLoading(true);
  try {
    if (!activeTenant) {
      setTags([]);
      return;
    }
    const fetchedTags = await getAllTags(activeTenant.tenantId);
    setTags(fetchedTags);
  } catch (error) {
    console.error('Failed to load tags:', error);
  } finally {
    setLoading(false);
  }
};
```

Add `activeTenant` to the `useEffect` dependency:
```typescript
useEffect(() => {
  loadTags();
}, [activeTenant]);
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: Errors should be reduced. Remaining errors will be in `use-tracked-bills.tsx` and `legislation.ts` (fixed in next tasks).

- [ ] **Step 6: Commit**

```bash
git add src/components/tags/tag-management-dialog.tsx src/components/tags/tag-selector.tsx src/components/tags/card-tag-selector.tsx src/components/tags/tag-filter-list.tsx
git commit -m "feat: pass tenantId to all tag service calls in components"
```

---

### Task 5: Update Remaining Callers — use-tracked-bills.tsx and legislation.ts

**Files:**
- Modify: `src/hooks/use-tracked-bills.tsx:33`
- Modify: `src/services/data/legislation.ts:608`

- [ ] **Step 1: Update `use-tracked-bills.tsx`**

Line 33 calls `getBillTags(trackedBill.id)` without `tenantId`. The hook already has `activeTenant` from `useAuth()`. Pass it:

```typescript
const tags = await getBillTags(trackedBill.id, activeTenant!.tenantId);
```

This is safe because `handleTrackBill` already checks `if (!user) return false;` and tracking only happens for authenticated tenant users.

- [ ] **Step 2: Update `legislation.ts` — `updateFoodStatusOrCreateBill`**

Line 608 calls `getAdditionalBillData([result.id], true)` without `tenantId`. This function is called from components that have `activeTenant`. Add `tenantId` as an optional parameter to the function and pass it through.

Update the function signature at line 502:
```typescript
export async function updateFoodStatusOrCreateBill(bill: Bill | BillDetails | null, foodState: boolean | null, tenantId?: string): Promise<Bill> {
```

Update line 608 to pass `tenantId`:
```typescript
const { statusUpdates, tags, trackedBy, trackedCount } = await getAdditionalBillData([result.id], true, tenantId);
```

Note: `tenantId` stays optional here because this function can be called for bills that aren't yet tenant-scoped. When `tenantId` is undefined, `getBatchBillTags` will... wait — we made it required. We need to handle this differently.

Since `getBatchBillTags` now requires `tenantId`, and `getAdditionalBillData` has callers that pass it (lines 53, 98, 207) and one that doesn't (line 608), we need `getAdditionalBillData` to handle the case where `tenantId` is missing by returning empty tags.

Update `getAdditionalBillData` at line 231:
```typescript
async function getAdditionalBillData(billIds: string[], includeTrackedBy: boolean = false, tenantId?: string) {
  const statusUpdates = await getBatchStatusUpdates(billIds);
  const tags = tenantId ? await getBatchBillTags(billIds, tenantId) : {};
  const trackedBy = includeTrackedBy ? await getTrackedByForBills(billIds, tenantId) : {};
  const trackedCount = await getTrackedCountForBills(billIds, tenantId);
```

This keeps `getAdditionalBillData`'s signature unchanged (it's a private helper), but now when `tenantId` is missing, tags come back empty (which is correct — public users see no tags).

Also update the callers of `updateFoodStatusOrCreateBill` in `new-bill-dialog.tsx` and `kanban-card.tsx` to pass `tenantId`:

In `src/components/kanban/new-bill/new-bill-dialog.tsx`, the component has access to `activeTenant` via `useAuth`. Line 103:
```typescript
const result = await updateFoodStatusOrCreateBill(billPreview, foodRelatedSelection, activeTenant?.tenantId)
```

In `src/components/kanban/kanban-card.tsx`, the component has access to `activeTenant` via `useAuth`. Line 81:
```typescript
await updateFoodStatusOrCreateBill(bill, false, activeTenant?.tenantId);
```

Check that both of these components import `useAuth` and have `activeTenant` available. If not, add the import and destructure.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors related to tags.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-tracked-bills.tsx src/services/data/legislation.ts src/components/kanban/new-bill/new-bill-dialog.tsx src/components/kanban/kanban-card.tsx
git commit -m "feat: pass tenantId through remaining tag service callers"
```

---

### Task 6: Fix API Routes — Enforce tenant filtering

**Files:**
- Modify: `src/app/api/bills/[id]/tags/route.ts`
- Modify: `src/app/api/bills/[id]/route.ts:46-49`

- [ ] **Step 1: Fix GET `/api/bills/[id]/tags`**

Currently this endpoint is marked "public access" and has no tenant filtering. Replace the entire GET handler to require auth and tenant context:

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params;

    const sessionToken = getSessionCookie(request);
    if (!sessionToken) {
      return NextResponse.json({ tags: [] });
    }

    let user;
    try {
      user = await validateSession(sessionToken);
    } catch {
      return NextResponse.json({ tags: [] });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ tags: [] });
    }

    await validateMembership(user.id, tenantId);

    const tags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.tenant_id',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .where('t.tenant_id', '=', tenantId)
      .orderBy('t.name', 'asc')
      .execute();

    return NextResponse.json({ tags });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching bill tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bill tags' },
      { status: 500 }
    );
  }
}
```

Add the import for `validateMembership`:
```typescript
import { validateMembership } from '@/services/data/tenants';
```

- [ ] **Step 2: Fix POST `/api/bills/[id]/tags`**

Add tenant extraction and filtering. The user must provide `tenantId` in the request body, and we validate membership. Filter tag validation by tenant:

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionToken = getSessionCookie(request);
    const user = await validateSession(sessionToken);

    if (user.role !== 'admin' && user.role !== 'supervisor') {
      return NextResponse.json(
        { error: 'Forbidden: Only admins and supervisors can tag bills' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { tagIds, tenantId } = body;
    const { id: billId } = await params;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    await validateMembership(user.id, tenantId);

    const validation = tagsSchema.safeParse({ tagIds });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues.map(i => i.message).join(', ') }, { status: 400 });
    }

    const bill = await db
      .selectFrom('bills')
      .select('id')
      .where('id', '=', billId)
      .executeTakeFirst();

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Remove existing tags for this bill that belong to this tenant
    await db
      .deleteFrom('bill_tags')
      .where('bill_id', '=', billId)
      .where('tag_id', 'in',
        db.selectFrom('tags').select('id').where('tenant_id', '=', tenantId)
      )
      .execute();

    if (tagIds.length > 0) {
      const validTags = await db
        .selectFrom('tags')
        .select('id')
        .where('id', 'in', tagIds as string[])
        .where('tenant_id', '=', tenantId)
        .execute();

      if (validTags.length !== tagIds.length) {
        return NextResponse.json(
          { error: 'One or more tag IDs are invalid' },
          { status: 400 }
        );
      }

      await db
        .insertInto('bill_tags')
        .values(
          tagIds.map((tagId: string) => ({
            bill_id: billId,
            tag_id: tagId,
          }))
        )
        .execute();
    }

    const tags = await db
      .selectFrom('bill_tags as bt')
      .innerJoin('tags as t', 'bt.tag_id', 't.id')
      .select([
        't.id',
        't.name',
        't.color',
        't.tenant_id',
        't.created_at',
        't.updated_at',
      ])
      .where('bt.bill_id', '=', billId)
      .where('t.tenant_id', '=', tenantId)
      .orderBy('t.name', 'asc')
      .execute();

    return NextResponse.json({ tags });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating bill tags:', error);
    return NextResponse.json(
      { error: 'Failed to update bill tags' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Fix PATCH `/api/bills/[id]` — require tenantId for updateTags action**

In `src/app/api/bills/[id]/route.ts`, the `updateTags` case at line 46 already passes `tenantId` to the service. But the handler doesn't reject requests with missing `tenantId`. Add a guard:

```typescript
case 'updateTags': {
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required for tag updates' }, { status: 400 });
  }
  const { tagIds } = body;
  const tags = await updateBillTags(billId, tagIds, tenantId);
  return NextResponse.json({ tags }, { status: 200 });
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bills/[id]/tags/route.ts src/app/api/bills/[id]/route.ts
git commit -m "feat: enforce tenant filtering in tag API routes"
```

---

### Task 7: Verify — typecheck, tests, build

**Files:** None (verification only)

- [ ] **Step 1: Run tests**

Run: `npm run test`
Expected: All existing tests pass. Tag tests are pure unit tests and shouldn't be affected.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Final commit (if any lint/type fixes were needed)**

If any fixes were required during verification, commit them:
```bash
git commit -m "fix: resolve type/lint issues from tenant-scoped tags changes"
```
