# Mobile Responsiveness Design

**Date:** 2026-06-01
**Status:** Approved

## Overview

Make the Food+ Bill Tracker fully responsive across all screen sizes — phones (~375px), tablets (~768px), and desktops (1024px+). The app is currently desktop-only with hardcoded widths, fixed padding, and no mobile breakpoints on major components.

## Breakpoint Strategy

Use **md (768px)** as the primary mobile/desktop split. Below md = mobile layout. At md and above = current desktop layout unchanged. Standard Tailwind breakpoints — no custom config needed.

## Changes by Area

### 1. Root Layout & Globals

- **Viewport meta tag**: Verify Next.js metadata export includes it; add if missing.
- **Global spacing**: Replace `px-8` with `px-3 md:px-8` on major containers. Apply `overflow-x-hidden` to body/main to prevent accidental horizontal scroll on mobile.
- **No Tailwind config changes** — default breakpoints are sufficient.

### 2. Header — Mobile Compact + Bottom Tab Bar

**Mobile header (below md):**
- Single row: app title (left) + hamburger menu button (right).
- Hamburger opens a dropdown/popover containing: tenant selector, search input, auth menu.
- View tabs (Kanban/Spreadsheet/Admin) removed from header on mobile.

**Desktop header (md+):**
- No changes.

**New component — Bottom Tab Bar:**
- Fixed to bottom of screen, `md:hidden`.
- Three tabs: Kanban, Spreadsheet, Admin (same icons as current header tabs).
- Highlights active tab.
- Uses the same `setActiveView` state as the header tabs.

**Kanban bottom nav bar:**
- Gets `hidden md:flex` — hidden on mobile (buttons move to pill strip, see section 3).

### 3. Kanban Board — Mobile Columns + Pill Strip

**Column sizing:**
- Mobile: `w-[85vw]` — 85% of viewport, gives a peek at the next column to signal swipability.
- Desktop: `w-80` — unchanged.

**Column height:**
- Mobile: `h-[calc(100vh-12rem)]` — accounts for compact header + bottom tab bar.
- Desktop: `h-[calc(100vh-10rem)]` — unchanged.

**New: Quick-scroll pill strip (below md only):**
- Positioned between header and kanban scroll area.
- Horizontal row of small pill buttons: Introduced, Crossover, Conference, Governor.
- Horizontally scrollable if they overflow.
- Tapping a pill scrolls the kanban board to that column.
- `md:hidden`.

**Existing bottom bar:**
- Gets `hidden md:flex` — desktop only.

**Touch/swipe:**
- Existing `ScrollArea` with horizontal orientation already supports touch swipe. No extra gesture library.

### 4. Spreadsheet — Sticky Column + Compact Mobile Table

**Cell padding:**
- Reduce from `p-4` to `p-2 md:p-4` (cells and headers).

**Column widths on mobile:**

| Column             | Mobile      | Desktop (unchanged) |
|--------------------|-------------|---------------------|
| Bill #             | `w-[6rem]`  | `w-[8rem]`          |
| Current Status     | `w-[8rem]`  | `w-[10rem]`         |
| Bill Title         | `w-[15rem]` | `w-[30rem]`         |
| Policy Description | `w-[15rem]` | `w-[30rem]`         |
| Committee          | `w-[8rem]`  | `w-[12rem]`         |
| Introducer         | `w-[8rem]`  | `w-[12rem]`         |
| Year               | `w-[5rem]`  | `w-[6rem]`          |
| Next Deadline      | `w-[8rem]`  | `w-[10rem]`         |
| Tags               | `w-[10rem]` | `w-[15rem]`         |

Total mobile width: ~75rem (~1200px) — still scrollable but much more manageable than current ~188rem.

**Sticky column:** Bill # stays `sticky left-0` — works on both mobile and desktop.

**Font size:** Table text gets `text-xs md:text-sm`.

**Filter/sort popover:** No changes — popovers position relative to trigger.

### 5. Dialogs

- Reduce padding from `p-6` to `p-4 md:p-6`.
- Keep centered overlay behavior — no structural changes.
- Auth dialogs already have `sm:max-w-[425px]` with `w-full` fallback — works fine.

### 6. Typography & Spacing

**Typography:**
- Header title: `text-lg md:text-xl`.
- Spreadsheet table: `text-xs md:text-sm`.
- No other font size changes.

**Spacing patterns applied globally:**
- `px-3 md:px-8` for major containers.
- `p-2 md:p-4` for content areas currently using `p-4`.
- `gap-2 md:gap-4` where gaps are currently `gap-4`.

### 7. Components With No Changes

- **Kanban cards**: Inherit column width change; no card-specific changes.
- **Buttons**: Touch targets already 40px height — good for mobile.
- **Form inputs**: Already have `text-base md:text-sm` pattern and `w-full`.
- **Tailwind config**: No custom breakpoints or theme changes needed.

## New Components

1. **BottomTabBar** — fixed bottom nav for mobile with Kanban/Spreadsheet/Admin tabs.
2. **MobileHamburgerMenu** — dropdown/popover triggered from header hamburger icon, containing tenant selector, search, and auth menu.
3. **KanbanPillStrip** — horizontal row of quick-scroll pill buttons for mobile kanban navigation.

## Files to Modify

- `src/app/layout.tsx` — viewport meta verification
- `src/app/page.tsx` — add BottomTabBar, adjust main container spacing
- `src/app/globals.css` — overflow-x-hidden on body
- `src/components/main/header.tsx` — responsive header with hamburger on mobile
- `src/components/kanban/kanban-board.tsx` — responsive columns, pill strip, hide bottom bar on mobile
- `src/components/kanban/kanban-column.tsx` — responsive width and height
- `src/components/kanban/kanban-spreadsheet.tsx` — responsive column widths, padding, font size
- `src/components/ui/dialog.tsx` — responsive padding
- New: `src/components/main/bottom-tab-bar.tsx`
- New: `src/components/main/mobile-hamburger-menu.tsx`
- New: `src/components/kanban/kanban-pill-strip.tsx`
