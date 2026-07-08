# Active Boards — Design Spec

**Date:** 2026-07-08
**Status:** Approved for planning

## Summary

Active Boards is a read-only window into *another organization's* kanban board.
The `/boards` route already exists as a placeholder ("Active Boards", `LayoutGrid`
icon, present in the header nav and mobile bottom tab bar). This spec fills it in.

An org admin opts their board into public visibility. Any logged-in user can follow
any opted-in org, and view one followed org's board at a time — read-only, with the
ability to track a bill into their *own* context from it.

## User-facing behavior

### Navigation & page structure

`/boards` becomes a two-tab experience wired into the existing header sub-nav slot
(the same slot Testimonies uses via `HeaderSubNav`):

- **View Board** tab (`/boards`) — the read-only kanban, with an org-switcher
  dropdown to flip between the orgs the user follows.
- **Browse Orgs** tab (`/boards/browse`) — lists every org that opted into public
  visibility; follow/unfollow from here.

Tab state lives in the URL (separate route segments, mirroring `/testimonies` and
`/testimonies/drafts`) so it survives refresh and is linkable. `HeaderSubNav` gains
a `pathname.startsWith('/boards')` branch that renders an `ActiveBoardsSubNav`
(desktop + compact mobile variants), parallel to `TestimoniesSubNav`.

**Empty state:** if the user follows zero orgs, the View Board tab shows
"No boards yet — Follow an organization to see its board here" with a button
linking to Browse Orgs. (View Board remains the default landing tab; only its body
shows the empty state.)

### View Board header

Mirrors the "Your Bills" kanban header, stripped down:

- **Filter-bills text box** — filters bills within the currently-viewed org's board
  (placeholder e.g. "Filter this board…"). Deliberately *not* labeled "Search",
  to avoid colliding with the global Search nav tab.
- **Tag / year / dead-alive filters** — the same `TagFilterList` popover as the
  kanban, scoped to the viewed org's tags, but read-only (no tag-management gear).
- **Org-switcher dropdown** ("Viewing: Org A ▾") replacing the kanban's
  Track / Manage / Download cluster. Lists **only the orgs the user follows** —
  discovering/following new orgs happens on the Browse Orgs tab, *not* in this
  dropdown. If the user follows exactly one org, the dropdown still renders (shows
  that org) for consistency.

### The board (read-only)

Reuses the existing kanban rendering with a read-only mode. Relative to the normal
kanban:

- **Keeps:** columns, tags, tag filtering, deadline chips, Failed badge, and an
  **org-level "testimony written" chip** — shown when a testimony exists for that
  bill in *that org* (any member of the org wrote one).
- **Removes:** the testimony **due/alert** badge (pulsing), the person/**Users**
  icon + tracked count, the **LLM Accept/Reject** buttons, pending-proposal
  temp-cards, and all drag / assign / remove / propose controls.
- **Keeps one action per card:** **"Track this bill"** → adopts the bill into the
  *viewer's own* context (their active org or personal list), not the viewed org.

### Bill details dialog

On this surface, the "Tracked By" (who is tracking the bill) section is hidden.

### Org Settings (admin only)

A new admin-only **Org Settings dialog**, opened from the user menu (admin-gated,
next to the existing "Invite User"). v1 contains a single **"Public board
visibility"** toggle with helper text: "When on, anyone can view this org's board
(read-only) under Active Boards." Default **OFF** — orgs opt in explicitly.

## Data model

Two new migrations (`000025`, `000026`):

1. **`tenants.public_board boolean NOT NULL DEFAULT false`** — the opt-in visibility
   flag. Off by default: nothing appears in Active Boards until an admin enables it.

2. **`org_follows` table** — who follows which org:

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

## Authorization

The critical distinction from the normal kanban: Active Boards reads orgs the user
is **not** a member of.

- Today `GET /api/bills?tenantId=X` calls `validateMembership`, so an org's board is
  member-only. That path is **left untouched**.
- Active Boards gets its **own** read path:
  - **Guard:** `requireSession` (must be logged in) — *not* `requireMembership`.
  - **Gate:** the target org must have `public_board = true`, else 404. Membership is
    irrelevant on this path.

This prevents Active Boards from becoming a hole in tenant isolation: a non-public
org is never readable through it, member or not.

## Data-access layer (`src/db/queries/*` — source of truth)

- **`tenants.ts`** (new functions):
  - `listPublicTenants(viewerUserId)` → opted-in orgs, each with an `isFollowing` flag.
  - `getPublicTenant(tenantId)` → the org if `public_board = true`, else null (gate helper).
  - `setPublicBoard(tenantId, enabled)` → admin write.
  - `followOrg(userId, tenantId)` / `unfollowOrg(userId, tenantId)`.
  - `listFollowedTenants(userId)` → the orgs a user follows (for the switcher).
- **`testimony.ts`** (new): `getOrgTestimonyBillIds(tenantId, billIds)` → the subset
  of `billIds` that have any testimony row for `(bill_id, tenant_id)` — the org-level
  "testimony written" signal (distinct from the existing per-user `getTestimonyStatuses`).
- **Reuse** `getAllTrackedBills(showArchived, tenantId, includeTrackedBy)` for the
  board's bills, called with `includeTrackedBy: false` so person-tracking data never
  leaves the DB for this surface.

## Data-client wiring

New **`boards` domain** (`data.boards.*`), following the `defineClient` pattern —
each op has an `action` arm (`src/app/actions/boards.ts`) and a `fetch` arm
(`src/lib/data-client/boards.client.ts`) hitting new API routes, registered in
`boards.client.ts` and exported from `data-client/index.ts`:

- `data.boards.listPublicOrgs()` → `{ tenantId, name, slug, isFollowing }[]`.
- `data.boards.follow({ tenantId })` / `data.boards.unfollow({ tenantId })` → `void`.
- `data.boards.listFollowed()` → followed orgs (for the switcher dropdown).
- `data.boards.getBoard({ tenantId })` → `Bill[]` (throws if the org is not public).
- `data.boards.getTestimonyOrgStatus({ tenantId, billIds })` → `billId[]` with an
  org-level testimony.

**Admin op:** `public_board` is written via the existing `/api/tenants/[id]` PATCH
route, extended to accept `public_board` and guarded with `requireAdmin`. (Consistent
with the admin domain running action/route-side with admin guards.)

## Board rendering — reuse, don't fork

The kanban already threads a `readOnly` prop
(`protected-kanban-board.tsx` → `KanbanBoard`). Active Boards mounts the **same
`KanbanBoard`** in a dedicated provider stack with a new context flag
`boardMode: 'active-boards' | 'own'` (default `'own'`) that the shared components
branch on:

- **`KanbanCard`** under `active-boards`: hide testimony due/alert badge, Users
  icon+count, LLM Accept/Reject, and assign/remove controls; show the org-level
  "testimony written" chip fed by `getTestimonyOrgStatus` (not the per-user
  `testimonyStatuses`); keep one "Track this bill" action.
- **`KanbanColumn`** under `active-boards`: do not render pending-proposal temp-cards.
- **`BillDetailsDialog`**: hide the "Tracked By" section (already gated on
  `canSeeTracking`; `active-boards` forces it false).
- **`TagFilterList`** reused, read-only (no tag-management gear).

Rationale: a `boardMode` flag threaded through the existing kanban context, rather
than a forked `ActiveBoardCard`, keeps the two surfaces from drifting out of sync.

**Invariant:** `boardMode` defaults to `'own'`, so the existing `/` kanban, admin, and
spreadsheet views are unaffected. Only the Active Boards provider sets
`boardMode: 'active-boards'`. Every card/column/dialog branch must treat `'own'` as
the current behavior verbatim.

**"Track this bill" from another org's board:** calls the existing
`trackBill(viewerUserId, bill.url, viewerActiveTenantId)` — adopts into the *viewer's*
active org/personal list. `trackBill` takes a bill URL and resolves it via
`findExistingBillByURL`; the `Bill` client type already exposes `url` (see
`src/types/legislation.ts`), and the bill always already exists in `bills` on this
surface, so the lookup hits the existing row (no scrape) and `trackBill` just adds
the viewer's `user_bills` (+ `org_bills` for their org) row. No new write logic and
no new write function needed.

## Files

**New:**

- `src/app/(main)/boards/page.tsx` (replace placeholder → View Board)
- `src/app/(main)/boards/browse/page.tsx` (Browse Orgs)
- `src/components/boards/active-boards-subnav.tsx` (View Board / Browse Orgs tabs, desktop + compact)
- `src/components/boards/browse-orgs-list.tsx` (opted-in orgs, follow/unfollow)
- `src/components/boards/active-board-view.tsx` (org-switcher dropdown + read-only `KanbanBoard`)
- `src/components/boards/org-switcher-dropdown.tsx`
- `src/hooks/contexts/active-boards-context.tsx` (selected orgId + localStorage last-viewed, follows list)
- `src/components/admin/org-settings-dialog.tsx`
- `src/app/actions/boards.ts`
- `src/lib/data-client/boards.client.ts`
- `src/app/api/boards/route.ts` (list public + followed)
- `src/app/api/boards/follow/route.ts`
- `src/app/api/boards/[tenantId]/bills/route.ts`
- `src/db/migrations/000025_add_public_board_to_tenants.{up,down}.sql`
- `src/db/migrations/000026_create_org_follows_table.{up,down}.sql`

**Modified:**

- `src/components/main/header-subnav.tsx` (add `/boards` branch)
- `src/db/queries/tenants.ts` (public/follow functions)
- `src/db/queries/testimony.ts` (add `getOrgTestimonyBillIds`)
- `src/db/types.ts` (regenerated: `public_board`, `org_follows`)
- `src/components/kanban/kanban-card.tsx`, `kanban-column.tsx`, `bill-details-dialog.tsx` (branch on `boardMode`)
- `src/hooks/contexts/kanban-board-context.tsx` (thread `boardMode`)
- `src/components/auth/user-menu.tsx` (add admin-only Org Settings entry)
- `src/app/api/tenants/[id]/route.ts` (PATCH accepts `public_board`, `requireAdmin`)
- `src/lib/data-client/index.ts` (register `boards`)

## Testing

Pure-logic unit tests in `src/lib/__tests__/` per repo convention:

- Follow-list dedupe/sort helper (if extracted).
- A `boardMode` display-rule helper (extract the "what shows on a card" decision into
  a pure function so it is unit-testable).

Then run `npm test`, `npm run typecheck`, and `npm run build` (the build catches
`'use server'` export violations that typecheck does not).

## Out of scope (v1)

- Public (logged-out) access to Active Boards — requires a session.
- Notifications when a followed org's board changes.
- Any org setting beyond the public-board toggle.
- Following/viewing more than one org's board simultaneously.
