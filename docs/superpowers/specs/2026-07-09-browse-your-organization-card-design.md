# Browse page — "Your Organization" card

**Date:** 2026-07-09
**Status:** Approved for implementation

## Summary

Three changes to the Browse (formerly "Browse Orgs") page under Active Boards:

1. Rename the sub-nav tab from **"Browse Orgs"** to **"Browse"**.
2. Add a read-only **"Your Organization"** card at the top of the left column, shown only to users who belong to an org. It surfaces that org's stats — followers, bill count, and the bills they track — with an olive background so it clearly reads as *yours*.
3. Recolor the existing **"At a glance"** stat blob from olive to light gray, so olive now uniquely signals "your org."

Editing is out of scope for this iteration. The card is read-only; it only points admins to the existing Org Settings dialog and tells non-admins to ask their admin.

## Context

- Page: `src/app/(main)/boards/browse/page.tsx` → renders `BrowseOrgsList`.
- Main component: `src/components/boards/browse-orgs-list.tsx` — left column (search + org grid), right sidebar (`StatBlob` "At a glance", then `FollowedOrgs` "Following").
- Sub-nav: `src/components/boards/active-boards-subnav.tsx` — `TABS` array, `label: 'Browse Orgs'`.
- Membership on the client: `useAuth()` (`src/hooks/contexts/auth-context.tsx`) exposes `activeTenant` (`tenantId`, `slug`, `name`, `orgRole`), `memberships`, and `isPublicUser`.
- Existing org stats query: `listPublicTenants(viewerUserId)` in `src/db/queries/tenants.ts` returns `PublicOrg` per org — but **only for orgs with `public_board = true`**. Reusing it would hide the card for members of a private org, so we add a dedicated query instead.
- Colors (`src/app/globals.css` / `tailwind.config.ts`): `bg-olive-soft` (#EAEED4), `border-olive`; light gray uses `bg-secondary/60` + `border` (matching the existing `FollowedOrgs` block).

## Requirements

### 1. Sub-nav rename

- In `active-boards-subnav.tsx`, change the second tab's `label` from `'Browse Orgs'` to `'Browse'`.
- Keep the `Building2` icon and `/boards/browse` href unchanged.
- No other consumers hard-code the string "Browse Orgs" for this tab (the page's own `<h1 className="sr-only">` is "Browse organizations" and is unrelated to the tab label — leave it).

### 2. "Your Organization" card

A new component `MyOrgCard` in `browse-orgs-list.tsx` (same file, alongside `OrgCard`/`StatBlob`).

**Visibility:** rendered only when the viewer belongs to an org — i.e. `activeTenant` is non-null (equivalently `!isPublicUser` with a resolved active tenant). Public users and logged-out users never see it.

**Placement:** full-width, at the top of the left column, above the search input. The right sidebar is unchanged in structure.

**Appearance:**
- Olive background: `bg-olive-soft` with `border border-olive/20` (mirrors the treatment being removed from `StatBlob`), `rounded-xl`, padding consistent with sibling cards.
- Eyebrow label **"YOUR ORGANIZATION"** (uppercase, tracking-wide, small) so it is unmistakably the viewer's own org.
- A role badge: **"Admin"** when `activeTenant.orgRole === 'admin'`, otherwise **"Member"** (the `worker` role is labeled "Member" in the UI).
- Org monogram (via `orgMonogram(name)`) + org name.
- Stats row: **followers** and **bill count**, using the same `FileText` / `Users` icon language as `OrgCard`.
- **"BILLS THEY TRACK"** preview list: up to 3 bills (`billNumber` + `billTitle`), same layout as `OrgCard`'s sample-bills block. Empty state: "No bills tracked yet."
- Footer verbiage (read-only guidance), using real em dashes (`—`), not spaced/AI-style dashes:
  - Admin: **"Edit what's displayed in Organization Settings."**
  - Non-admin: **"Ask your organization admin to update these details."**

**Read-only:** no inputs, switches, or track/untrack controls on this card in this iteration.

### 3. Recolor "At a glance"

- `StatBlob` background changes from `bg-olive-soft` / `border-olive/*` to `bg-secondary/60` + `border` (and its divider from `border-olive/30` to `border-border`), matching `FollowedOrgs`.
- Its contents and stats are unchanged: "Public Organizations" and "Total Bills Tracked" (global across the listed public orgs).

## Data flow

New read-only path returning the viewer's own org stats regardless of `public_board`:

- **Query:** `getMyOrgStats(tenantId: string, viewerUserId: string)` in `src/db/queries/tenants.ts`.
  - Returns the same shape as `PublicOrg`: `{ tenantId, name, slug, description, isFollowing, followerCount, billCount, sampleBills }`.
  - Computes `followerCount` (count of `org_follows` for the tenant), `billCount` (distinct `user_bills.bill_id` for the tenant), and `sampleBills` (reuse `getSampleBillsForTenants([tenantId])`).
  - Does **not** filter on `public_board` — a member of a private org still gets their stats.
  - `isFollowing` may be computed for consistency with `PublicOrg`, though the card does not render a follow control.
- **Action:** `getMyOrgStatsAction({ tenantId })` in `src/app/actions/boards.ts`, guarded by `requireMembership.fromAction(tenantId)` (must be a member of that tenant). Returns `PublicOrg`.
- **Fetch arm:** `getMyOrgStatsFetch({ tenantId })` in `src/lib/data-client/boards.client.ts`, hitting a route that returns the same already-unwrapped `PublicOrg`.
- **Route:** add a GET handler returning the member's org stats (new route under `src/app/api/boards/…` or extend an existing boards route), guarded by `requireMembership.fromRequest(request, tenantId)`. Follows the existing pattern used by `listPublicOrgs`.
- **Data-client registration:** add `getMyOrgStats: { action, fetch }` to the `boards` `defineClient` map. Add a `MyOrgStatsParams` type (`{ tenantId: string }`) to the boards params module.
- **Client usage:** `MyOrgCard` (or `BrowseOrgsList`) reads `activeTenant` from `useAuth()`, and when set, calls `data.boards.getMyOrgStats({ tenantId: activeTenant.tenantId })`. While loading, the card renders a lightweight skeleton/placeholder; on error it renders nothing (fails silent — discovery list is unaffected).

## Component boundaries

- `MyOrgCard` — presentational + its own data fetch keyed by `activeTenant.tenantId`. Input: nothing (reads context). Renders null when there is no active tenant. Self-contained; does not affect `orgs` list state.
- `BrowseOrgsList` — unchanged responsibilities except it now renders `<MyOrgCard />` above the search input in the left column. It does **not** thread org stats through its existing `orgs` state.
- `StatBlob` — unchanged structure; only Tailwind color classes change.

## Error handling

- `getMyOrgStats` for a tenant the user isn't a member of → `requireMembership` throws `ApiError` (403); the data-client surfaces it as a thrown error, and `MyOrgCard` catches it and renders nothing.
- Missing/loading stats → skeleton placeholder inside the card; the rest of the page renders normally.
- No active tenant → card not rendered at all.

## Testing

Per project conventions, only pure logic is unit-tested (no DB, no mocking). This feature is primarily UI + a DB query, so:

- Manual verification: as an org admin, as a `worker` member, and as a public/logged-out user, confirm the card shows/hides correctly, shows correct stats and role label, and shows the correct footer verbiage. Confirm a private-board org still shows the card for its members.
- Confirm the sub-nav reads "Browse".
- Confirm "At a glance" is now light gray and the Your Organization card is olive.
- Run `npm run typecheck`, `npm test`, and `npm run build` (the build catches `'use server'` export violations).
- If any pure helper is extracted (e.g. a role-label formatter), add a unit test in `src/lib/__tests__/`.

## Out of scope (explicitly)

- Editing bills displayed on the card (deferred).
- Editing org name / description / public toggle on the card (name editing has no backend and is deferred; description + toggle remain in the existing Org Settings dialog).
- Any change to the follow/unfollow flow or the Following sidebar block.
