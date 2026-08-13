# Header Navigation Tabs — Design

**Date:** 2026-07-02
**Status:** Approved

## Goal

Add top-level navigation tabs to the app header — **Search**, **Your Bills**, **Your Testimonies**, **View Active Boards** — as real Next.js routes. Your Bills is the existing Kanban experience behind a hard login wall; the other three are placeholder pages to be wired up later.

## Background

The app is currently a single-page app: everything renders at `/`, and the header tabs (Kanban / Spreadsheet / Admin) flip a `view` state in `kanban-board-context`. This change introduces real routes for top-level sections while keeping the existing view-state mechanism for the board's internal views.

## Decisions (from brainstorming)

1. **Real routes**, not view-state switching — each section is a shareable URL.
2. The **Kanban/Spreadsheet/Admin view toggle moves into the Your Bills page** as a toolbar; the header center belongs to the new nav tabs.
3. **Hard login wall** on Your Bills — logged-out visitors get a "log in to view your bills" screen.
4. The **public read-only board is dropped for now**; public browsing returns later via the Search page.

## Route Structure

A `(main)` route group shares a layout containing the header. `register/` and `verify-email/` stay outside the group, header-free as today.

```
src/app/
  (main)/
    layout.tsx          # renders <Header /> + page content
    page.tsx            # Your Bills (moved from src/app/page.tsx)
    search/page.tsx     # Search placeholder
    testimonies/page.tsx # Your Testimonies placeholder
    boards/page.tsx     # View Active Boards placeholder
  register/
  verify-email/
```

URLs are unchanged for `/`; new URLs are `/search`, `/testimonies`, `/boards`.

## Header Changes

- The centered `Tabs` (view state) are replaced with four nav links — Search, Your Bills, Your Testimonies, View Active Boards — styled like the current tabs, using `next/link` with `usePathname` to mark the active tab.
- Title, tenant selector, board search input, settings button, and `AuthHeader` remain unchanged.
- **Mobile:** the four nav links are added to the top of the hamburger menu (`mobile-hamburger-menu.tsx`). The "Admin View" switch in the hamburger stays, since the admin view still lives inside Your Bills.

## Your Bills Page (`/`)

- **Logged out:** a centered card — "Login to view your bills" — with a button opening the existing login dialog. While auth is loading, render nothing (matches current behavior).
- **Logged in:** the existing content — the Kanban/Spreadsheet/Admin view toggle (same `kanban-board-context` view state, same role-based visibility) rendered as a toolbar row above the board, then `ProtectedKanbanBoardOrSpreadsheet` / `AdminDashboard` / `SupervisorDashboard` per the current `view` switch.
- The mobile `BottomTabBar` (Kanban / Track / Spreadsheet) moves into this page, since its tabs only apply to the board.
- `ProtectedKanbanBoardOrSpreadsheet`'s internal `if (!user)` public branch becomes unreachable (the page gates first); it is left in place — removal is out of scope.

## Placeholder Pages

Each placeholder is a simple page: icon, heading, one-line description, "coming soon" note.

- **Search** (`/search`): additionally shows a disabled search input to set expectations.
- **Your Testimonies** (`/testimonies`): shows an empty-list frame.
- **View Active Boards** (`/boards`): shows an empty grid frame.

No data fetching, no new API routes, no DB changes.

## Component Organization

`components/main/` keeps its name and remains the home for app-shell/navigation components; new pieces land as follows:

```
src/components/
  main/
    header.tsx              # updated: nav links replace view tabs
    header-nav.tsx          # NEW: the four nav links (desktop), pathname-aware
    mobile-hamburger-menu.tsx # updated: nav links section added
    bottom-tab-bar.tsx      # unchanged component; rendered by Your Bills page instead of layout
    view-toggle.tsx         # NEW: Kanban/Spreadsheet/Admin toolbar extracted from header
  auth/
    login-wall.tsx          # NEW: logged-out gate card for Your Bills
  placeholder/
    placeholder-page.tsx    # NEW: shared icon + heading + description + coming-soon shell
```

The three placeholder pages compose `placeholder-page.tsx` with their own icon/copy plus their small extra frame (disabled search input / list frame / grid frame) inline in the page file.

## Error Handling

No new failure modes: no data fetching is added. The login wall relies on `useAuth` loading/user state exactly as the current protected board does.

## Testing

No new pure logic (`src/lib/` untouched), so no new unit tests. Verification:

- `npm test` — existing suite passes
- `npm run typecheck`
- `npm run build` — also validates the route-group move and `'use server'` constraints

Manual check: nav tabs navigate and highlight correctly on desktop and mobile; `/` shows login wall when logged out and the board + view toggle when logged in; register/verify-email pages render without the header.

## Out of Scope

- Wiring up Search, Testimonies, or Boards to real data
- Removing the now-unreachable public branch of `ProtectedKanbanBoardOrSpreadsheet`
- Any changes to `db/queries`, API routes, or server actions
