# Tenant-Scoped Tags — Design Spec

**Date:** 2026-06-01
**Status:** Approved

## Problem

Tags are not properly scoped to tenants. Any organization can see, create, and apply tags from other organizations. The `tags` table has a nullable `tenant_id` column, service functions treat tenant scoping as optional, components never pass tenant context, and API routes lack tenant filtering entirely.

## Solution

Enforce tenant scoping at every layer: database (NOT NULL constraint), service (required parameter), components (pass tenant context), and API routes (session-based tenant extraction).

## Changes

### 1. Database Migration

New migration file (next sequential number):

**Up:**
1. Find the Food+ tenant ID from the `tenants` table
2. Backfill all `tags` rows where `tenant_id IS NULL` with the Food+ tenant ID
3. Alter `tags.tenant_id` to `NOT NULL`

**Down:**
1. Alter `tags.tenant_id` back to nullable

### 2. Service Layer — `src/services/data/tags.ts`

Make `tenantId` a **required** `string` parameter (not optional) on all exported functions:

- `getAllTags(tenantId: string)` — always filters by tenant_id
- `createTag(name: string, color: string, tenantId: string)` — always sets tenant_id
- `updateTag(id: string, name: string, color: string, tenantId: string)` — scopes update to tenant
- `deleteTag(id: string, tenantId: string)` — scopes delete to tenant
- `getBillTags(billId: string, tenantId: string)` — filters joined tags by tenant_id
- `getBatchBillTags(billIds: string[], tenantId: string)` — filters joined tags by tenant_id
- `updateBillTags(billId: string, tagIds: string[], tenantId: string)` — validates tag ownership before linking

Remove all `if (tenantId)` conditional scoping — every query always filters by tenant.

### 3. Components

All tag components extract `activeTenant` from `useAuth()` and pass `activeTenant.tenantId` to service calls. When there is no active tenant, the component returns `null` (hides tag UI for public users).

**Files:**
- `src/components/tags/tag-selector.tsx`
- `src/components/tags/tag-management-dialog.tsx`
- `src/components/tags/card-tag-selector.tsx`
- `src/components/tags/tag-filter-list.tsx`

### 4. API Routes

**`GET /api/bills/[id]/tags`** — Extract tenant from session via auth. If no tenant, return empty array. Filter tags query by `tenant_id`.

**`POST /api/bills/[id]/tags`** — Extract tenant from session. Validate submitted tag IDs belong to the user's tenant before inserting into `bill_tags`.

**`PATCH /api/bills/[id]` (updateTags action)** — Require `tenantId`. Reject requests with no tenant context.

### 5. Type Update

Add `tenant_id: string` to the `Tag` interface in `src/types/legislation.ts`.

## Public Users

Public users (no tenant) see no tags. Tag UI is hidden when `activeTenant` is absent. API endpoints return empty results when no tenant is in the session.

## Testing

- Existing unit tests should continue to pass (they test pure logic, not tag queries)
- Run `npm run typecheck` to verify all call sites pass the now-required `tenantId`
- Run `npm run build` to catch any missed call sites
