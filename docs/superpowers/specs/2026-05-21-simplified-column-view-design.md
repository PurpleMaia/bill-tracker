# Simplified Column View — Design Spec

## Overview

Add a simplified kanban view that collapses the 25 detailed committee-level columns into 13 high-level columns. The simplified view merges all "waiting" statuses (regardless of committee number) into a single WAITING column, all "scheduled" statuses into a single SCHEDULED column, and does the same for crossover-phase statuses. Conference and governor columns remain unchanged.

**Purpose:** Public users and those unfamiliar with the legislative cycle get a cleaner, less overwhelming view. Org power users retain the detailed view for granular status tracking.

## Column Layout

### Simplified Columns (13 total)

| # | Column ID | Display Title | Statuses Grouped |
|---|-----------|---------------|------------------|
| 0 | `unassigned` | NOT ASSIGNED | `unassigned` |
| 1 | `simpleWaiting` | INTRODUCED & WAITING | `introduced`, `waiting2`, `waiting3` |
| 2 | `simpleScheduled` | SCHEDULED | `scheduled1`, `scheduled2`, `scheduled3`, `deferred1`, `deferred2`, `deferred3` |
| 3 | `simpleCrossoverWaiting` | CROSSOVER & WAITING | `crossoverWaiting1`, `crossoverWaiting2`, `crossoverWaiting3` |
| 4 | `simpleCrossoverScheduled` | CROSSOVER SCHEDULED | `crossoverScheduled1`, `crossoverScheduled2`, `crossoverScheduled3`, `crossoverDeferred1`, `crossoverDeferred2`, `crossoverDeferred3` |
| 5 | `passedCommittees` | CONFERENCE | `passedCommittees` |
| 6 | `conferenceAssigned` | AWAITING COMMITTEES | `conferenceAssigned` |
| 7 | `conferenceScheduled` | SCHEDULED | `conferenceScheduled`, `conferenceDeferred` |
| 8 | `conferencePassed` | PASSED CONFERENCE | `conferencePassed` |
| 9 | `transmittedGovernor` | TRANSMITTED TO GOVERNOR | `transmittedGovernor` |
| 10 | `vetoList` | GOVERNOR VETOED | `vetoList` |
| 11 | `governorSigns` | GOVERNOR SIGNED INTO LAW | `governorSigns` |
| 12 | `lawWithoutSignature` | LAW WITHOUT SIGNATURE | `lawWithoutSignature` |

### Detailed Columns (existing, unchanged)

The existing 25-column `KANBAN_COLUMNS` array remains as-is.

## State Management

### KanbanBoardContext

Add to the context:
- `columnView: 'detailed' | 'simplified'` — which column set is active
- `setColumnView` — setter

**Default:** `'simplified'` in the provider. `ProtectedKanbanBoard` sets it to `'detailed'` via a `useEffect` on mount when the user is an authenticated tenant member. The user can then toggle freely. If the user logs out or has no tenant, the default remains `'simplified'`.

## Column Definitions (`src/lib/kanban-columns.ts`)

### New Exports

- `SIMPLIFIED_COLUMNS: KanbanColumnData[]` — the 13-column array
- `STATUS_TO_SIMPLIFIED: Record<string, string>` — maps every `BillStatus` to a simplified column ID

### Existing Exports (unchanged)

- `KANBAN_COLUMNS`, `COLUMN_TITLES`, `COLUMN_INDEX` — no changes

## Board Component Changes (`src/components/kanban/kanban-board.tsx`)

- Read `columnView` from `useKanbanBoard()`
- Select active column set: `columnView === 'simplified' ? SIMPLIFIED_COLUMNS : KANBAN_COLUMNS`
- `billsByColumn` memo: when simplified, use `STATUS_TO_SIMPLIFIED` to map each bill's `current_bill_status` to the correct simplified column ID before grouping
- `tempBillsByColumn` memo: same mapping logic
- Quick-scroll button indices: compute from the active column set
- Column refs array: sized to the active column set
- Search scroll-to-column: uses active column set for index lookup
- **Drag-and-drop disabled when `columnView === 'simplified'`** — always renders the read-only path (no `DragDropContext`), regardless of the `readOnly` prop

The bill's underlying `current_bill_status` is never mutated. Simplified view is purely a presentation-layer grouping.

## Toggle UI (`src/components/kanban/kanban-header.tsx`)

- Add a `Switch` toggle in the toolbar (left side, alongside existing switches)
- Label: "Detailed View" — off = simplified, on = detailed
- Visible to all users (public and authenticated)
- Reads/writes `columnView` / `setColumnView` from `useKanbanBoard()`

## Drag-and-Drop Behavior

- **Simplified view:** Drag-and-drop always disabled, even for authenticated tenant members
- **Detailed view:** Existing behavior unchanged — workers propose, admins/supervisors commit directly
- Rationale: Simplified view targets users unfamiliar with the legislative cycle. Detailed view is for org power users who need granular control.

## Tests (`src/lib/__tests__/kanban-columns.test.ts`)

Extend the existing test file:

- **Completeness:** Every `BillStatus` has an entry in `STATUS_TO_SIMPLIFIED` mapping to a valid simplified column ID
- **Column count:** `SIMPLIFIED_COLUMNS` has exactly 13 entries
- **Column order:** Entries are in the expected order
- **Grouping correctness:** `scheduled1`, `scheduled2`, `scheduled3` all map to `simpleScheduled`; similar for waiting and crossover groups
- **1:1 statuses:** Conference and governor statuses map to themselves

## What's NOT Changing

- No database changes
- No API changes
- No changes to the derived-status algorithm (`src/lib/derived-status.ts`)
- No changes to `BillStatus` type or `src/db/types.ts` — simplified column IDs are display-only
- No changes to spreadsheet view, admin dashboard, or approvals view
- No changes to `KanbanColumn` or `KanbanCard` components
- No changes to drag-and-drop logic itself — just conditionally disabled

## Future Work (out of scope)

- User settings to persist preferred view per user
- Custom column configurations per organization
