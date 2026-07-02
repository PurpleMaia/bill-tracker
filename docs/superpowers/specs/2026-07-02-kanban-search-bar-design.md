# Kanban Search Bar Relocation + Client-Side Search + Header Layout Refactor — Design

**Date:** 2026-07-02
**Status:** Approved
**Depends on:** `2026-07-02-header-navigation-tabs-design.md` (branch `feat/header-nav-tabs`, PR #199)

## Goal

Move the bill search bar out of the app header into the kanban header, replace the server-round-trip search with an instant, relevance-ranked, typo-tolerant client-side search, and refactor the app header into a three-zone layout: contextual sub-navigation in the center, app-level nav as plain links on the right.

## Background / Problem

Today the app-header search input sets `searchQuery` in `kanban-board-context`. `kanban-board.tsx` reacts with a 300ms-debounced `useEffect` that calls `searchBills(bills, searchQuery)` — a function in the `'use server'` module `db/queries/bills-read.ts`. Every debounced keystroke therefore serializes the **entire client-side bills array** into a server-action POST, runs a trivial `.filter().includes()` on the server, and ships the results back. This forces async `loading`/`error`/`filteredBills` state for what is an in-memory filter. The spreadsheet view already filters the same data synchronously client-side (`kanban-spreadsheet.tsx`), so the two views also match inconsistently.

The header input is also uncontrolled (typed text is lost on remount), and after the nav-tabs change the header is shared by pages where board search is meaningless.

## Decisions (from brainstorming)

1. **Client-side instant filter** — synchronous `useMemo`, no debounce, no spinner, no error path.
2. **Relevance ordering** — bill number/ID matches rank above title matches, which rank above description matches.
3. **Fuzzy / typo tolerance** — bounded edit-distance word matching.
4. **Engine:** custom pure utility in `src/lib/` (approach A) — no new dependency.
5. **Desktop placement:** centered in the kanban header row, between the left switches and right controls. The existing mobile search row stays.
6. The unused server-side `searchBills` in `db/queries/bills-read.ts` is **deleted** (query function, not an API route).
7. **Header layout refactor:** app-level nav moves to the right of the header as plain links (no border/background); the header center becomes a contextual sub-nav slot styled with the existing tab treatment. On Your Bills the slot hosts the `ViewToggle`; the other pages get an empty slot for future sub-navs.
8. The `ViewToggle` toolbar row is removed from the Your Bills page (it was pushing the board down and cutting off content).

## New Pure Module: `src/lib/bill-search.ts`

`searchBillsLocal(bills: Bill[], query: string): Bill[]` — returns bills matching the query, ordered best-match-first. Pure, DB-free, synchronous.

Matching pipeline:

- **Normalize** both sides: lowercase, trim, collapse internal whitespace. For bill-number comparison, also strip spaces/hyphens from the query (`"sb 123"` → `"sb123"`).
- **Tokenize** the query on whitespace. **Every token must match the bill somewhere** (AND semantics). Empty/whitespace query returns all bills in input order.
- **Score** each bill per token, taking the best field match; a bill's score is the sum of its token scores. Tiers (high → low):
  1. `bill_number` or `id` exact match (space-stripped)
  2. `bill_number` or `id` prefix match
  3. `bill_number` or `id` substring match
  4. `bill_title` word-prefix or substring match
  5. `description` substring match
  6. Fuzzy word match in title (edit distance ≤ 1 for query tokens of 5–8 letters, ≤ 2 for 9+; tokens of ≤ 4 letters get no fuzz)
  7. Fuzzy word match in description (same distance bounds)
- **Order** by total score descending; ties preserve input order (stable sort).

A bill with any token scoring zero is excluded. The edit-distance helper is a small bounded Levenshtein (early-exit when the bound is exceeded) private to the module.

## Kanban Board Rewiring (`kanban-board.tsx`)

- Delete the debounced search `useEffect` (the `setTimeout`/`searchBills`/`setLoading`/`setError` block) and the `filteredBills` `useState`.
- Replace with: `const filteredBills = useMemo(() => (searchQuery.trim() ? searchBillsLocal(bills, searchQuery) : null), [bills, searchQuery]);`
- All downstream consumers (`billsByColumn`, drag-drop handler, temp-bill rendering, scroll-to-first-result effect) keep reading `filteredBills` with unchanged semantics (`null` = no active search).
- The scroll-to-first-result effect stays; the first result is now the best-ranked match.
- Search no longer touches the board's `loading` or `error` states. (Both remain for data loading.)
- Remove the `searchBills` import; delete the `searchBills` function from `db/queries/bills-read.ts`.

## Spreadsheet (`kanban-spreadsheet.tsx`)

Replace the inline `q`/`.includes()` filter block with `searchBillsLocal(bills-so-far, searchQuery)` so both views match identically. The spreadsheet's own sort logic (`sortKey`/`sortDirection`) still applies after filtering, exactly as today.

## Header Layout Refactor

Three zones in the existing dark-green header bar (desktop; mobile keeps the hamburger unchanged):

- **Left:** title + tenant selector, unchanged.
- **Center:** a new `HeaderSubNav` component (`src/components/main/header-subnav.tsx`) — the contextual sub-nav slot, absolutely centered like today's nav. It switches on `usePathname()`:
  - `/` → renders `ViewToggle` (Kanban / Spreadsheet / Admin) **only when a user is logged in** (hidden over the login wall).
  - `/search`, `/testimonies`, `/boards` → renders nothing for now; each page gets its own sub-nav here later (suggestions delivered post-implementation, not implemented).
  - The tab visual treatment (`bg-secondary` container, active pill `bg-primary`) stays with whatever renders in this slot.
- **Right:** `HeaderNav` restyled as **plain text links** — no border or background. Resting `text-primary-foreground/70`, hover white, active page marked with a 2px **olive underline** (echoes the header's existing `border-olive` bottom border). A single 150ms color/underline transition; no other hover effects. After the links: the settings icon and `AuthHeader`, as today.

**Label tightening:** desktop links drop their icons and use shortened labels — `Search`, `Your Bills`, `Testimonies`, `Active Boards`. `NAV_ITEMS` remains the single source of truth (it gains a short label per item); the mobile hamburger keeps icons and uses the same shortened labels.

**Your Bills page:** the `ViewToggle` toolbar row (`<div className="hidden md:flex justify-center pt-4">`) is deleted from `(main)/page.tsx` — the toggle now lives in the header center. Mobile view switching stays on the `BottomTabBar`.

## Search Bar Move

- **`header.tsx`:** remove the search `Input`, its `handleSearchChange`, the `Search` icon import, and the `useKanbanBoard` dependency (which exists only for `setSearchQuery`). The right cluster keeps settings + `AuthHeader`.
- **`kanban-header.tsx`:** desktop row gains a centered search input between the left switches and the right controls; the existing mobile input stays. Both inputs become **controlled** (`value={searchQuery}`), sharing one `handleSearchChange`. Styling follows the existing mobile input (icon-in-field, `pl-9`).
- `searchQuery` stays in `kanban-board-context` (both views + both inputs read it). Text now survives view switches and remounts because the inputs are controlled.

## Error Handling

None needed at runtime: search is a pure synchronous function over in-memory data. Empty query and no-match cases return `[]`/all-bills deterministically (no-match renders the board's existing empty columns; the spreadsheet keeps its existing "No bills found matching" message).

## Testing

New: `src/lib/__tests__/bill-search.test.ts` covering — empty/whitespace query returns input unchanged; bill-number normalization (`"sb 123"` finds `SB123`); AND-token semantics; ranking tiers (number > title > description); fuzzy matching (1 edit for 5+ letter tokens, 2 for 9+, none for ≤ 4); stable tie order; case insensitivity.

Existing suite, `npm run typecheck`, and `npm run build` must pass. Manual check: type in the kanban header search (desktop + mobile), see instant filtering in both board and spreadsheet views, board auto-scrolls to the best match, no spinner appears while typing. Header: view toggle appears centered in the header on `/` when logged in (absent when logged out and on other pages); nav links sit on the right as plain text with olive underline on the active page; the board is no longer pushed down by a toolbar row.

## Out of Scope

- The `/search` placeholder page (global bill search) — separate feature.
- Any change to how bills are fetched (`getBills`, bills-context).
- Highlighting matched bills (the commented-out `highlightedBillId` code stays as-is).
- Actual sub-nav contents for `/search`, `/testimonies`, `/boards` — suggestions are delivered after implementation; the center slot simply renders nothing on those pages for now.
