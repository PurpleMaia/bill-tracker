# Spreadsheet View Optimization — Design Spec

**Date:** 2026-06-01
**Status:** Draft

## Problem

The spreadsheet component (`kanban-spreadsheet.tsx`) makes N individual `getBillDetails()` calls on every render — one per bill — even though the `BillsContext` already provides most of the needed data. It also lacks sorting, doesn't apply the shared tag/year/search filters, and is missing useful columns (dead status, next deadline).

## Solution

Rewrite the spreadsheet to consume `bills` directly from `useBills()`, add `introducer` to the base `Bill` type so no extra fetches are needed, add sortable column headers, and align filtering with the kanban board.

## Changes

### 1. Data Layer — Add `introducer` to `Bill`

**File:** `src/types/legislation.ts`

Add `introducer?: string` to the `Bill` interface.

**File:** `src/services/data/legislation.ts`

In the `baseBill` object inside the bill converter function, add:
```
introducer: bill.introducer ?? '',
```

This field is already available from the DB query — it's just not included in the base `Bill` object today. No API route changes needed; `/api/bills` flows through the same converter.

### 2. Spreadsheet Component — Data Consumption

**File:** `src/components/kanban/kanban-spreadsheet.tsx`

**Remove:**
- `getBillDetails` import and all per-bill fetch logic (the `useEffect` with `Promise.all`)
- Local `loading` and `filteredBills` state
- `BillDetails` type import

**Use instead:**
- `bills` and `loadingBills` from `useBills()`
- `searchQuery`, `selectedTagIds`, `selectedYears` from `useKanbanBoard()`
- New `deadFilter` from `useKanbanBoard()` (see section 5)

**Single `useMemo`** computes `displayBills` from `bills` + all filter/sort state:
1. Search filter — match `bill_number`, `bill_title`, `description` against `searchQuery` (case-insensitive substring)
2. Tag filter — bill must have at least one tag whose ID is in `selectedTagIds`
3. Year filter — `bill.year` must be in `selectedYears`
4. Dead filter — if `'dead'`, keep only `bill.dead === true`; if `'alive'`, keep only `bill.dead === false`; if `'all'`, no filter
5. Sort — apply `compareBills()` if a sort key is active

### 3. Column Layout

| # | Column | Source | Sortable |
|---|--------|--------|----------|
| 1 | Bill # | `bill.bill_number` with dead/alive dot | Yes — natural sort (prefix alpha, then numeric) |
| 2 | Current Status | `formatBillStatusName(bill.current_bill_status)` | Yes — alphabetical |
| 3 | Bill Title | `bill.bill_title` | Yes — alphabetical |
| 4 | Policy Description | `bill.description` | Yes — alphabetical |
| 5 | Committee | `bill.committee_assignment` | Yes — alphabetical, nulls last |
| 6 | Introducer | `bill.introducer` | Yes — alphabetical |
| 7 | Year | `bill.year` | Yes — numeric, nulls last |
| 8 | Next Deadline | Computed via `getNextDeadline()` | Yes — date sort, nulls last |
| 9 | Tags | `bill.tags` rendered as colored badges | No |

**Removed from current spreadsheet:** Tracking count column.
**Added:** Year, Next Deadline, dead/alive dot indicator.
**Kept:** Bill #, Status, Title, Description, Committee, Introducer (now from context), Tags.

Bill # column remains sticky left.

### 4. Sorting

**State:** `sortKey: SortKey | null` and `sortDirection: 'asc' | 'desc'`, local to the spreadsheet component.

**Interaction:**
- Click a sortable header → set as active key, ascending
- Click same header again → toggle to descending
- Two-state toggle (no "unsorted" third click)

**Sort indicators** (lucide-react icons):
- Inactive: `ArrowUpDown` in muted color
- Active asc: `ArrowUp`
- Active desc: `ArrowDown`

**Sort logic:**
- **Bill #:** Split into prefix (alpha) and number (numeric). Compare prefix alphabetically first, then number numerically.
- **Alphabetical columns:** `localeCompare`
- **Year:** Numeric comparison, nulls sort last
- **Next Deadline:** Compare by `deadline.date` string (YYYY-MM-DD format, so lexicographic = chronological). Nulls sort last.

### 5. Dead/Alive Indicator and Filter

**Visual indicator (Bill # column):**
- Dead bill: Small red dot (static) rendered inline before the bill number
- Alive bill: Small green dot with CSS pulse animation rendered inline before the bill number

**Dead filter (new state in KanbanBoardContext):**

**File:** `src/hooks/contexts/kanban-board-context.tsx`

Add to context:
```
deadFilter: 'all' | 'dead' | 'alive'
setDeadFilter: Dispatch<SetStateAction<'all' | 'dead' | 'alive'>>
```

Default value: `'all'`.

**Filter UI:**

**File:** `src/components/kanban/kanban-header.tsx`

Add a dead filter control in the filter bar alongside existing tag and year filters. Three options: All / Dead / Alive. Use a segmented button group or small dropdown, consistent with existing filter UI patterns.

### 6. Tags Display and Row Styling

**Tags bar:** For bills with tags, render an extra `<TableRow>` immediately before the bill's data row. This tag row contains a single `<TableCell colSpan={totalColumns}>` with the tag badges inside. Each tag is a `Badge` with `backgroundColor: tag.color`, white text, matching the kanban card tag style (10px font, rounded). The tag row has no bottom border so it visually merges with the data row below it.

**Row background tint:** If a bill has tags, the row gets a muted background using the first tag's color at ~8% opacity. If no tags, default background.

### 7. Next Deadline Computation

Computed per row during render using `getNextDeadline()` from `src/lib/dead-bill.ts`:
- Inputs: `bill.bill_number`, `bill.current_bill_status`, `bill.committee_assignment`, `deadlinesJson`, `today`
- Skip if `bill.dead` is true (show "—")
- Display: Date formatted (e.g. "Mar 5") + deadline name (e.g. "First Crossover")
- Amber text color if deadline is within 7 days

### 8. Public View

`isPublicView` prop: All columns shown — no columns need hiding since tracking count was removed.

## Files Changed

| File | Change |
|------|--------|
| `src/types/legislation.ts` | Add `introducer?: string` to `Bill` |
| `src/services/data/legislation.ts` | Add `introducer` to `baseBill` object |
| `src/components/kanban/kanban-spreadsheet.tsx` | Full rewrite — context consumption, sorting, filtering, new columns |
| `src/hooks/contexts/kanban-board-context.tsx` | Add `deadFilter` state |
| `src/components/kanban/kanban-header.tsx` | Add dead filter UI control |
