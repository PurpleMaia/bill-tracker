# Simplified Column View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simplified 13-column kanban view that collapses committee-level granularity into high-level phases, with a toggle to switch between simplified and detailed views.

**Architecture:** Presentation-layer mapping approach. Define `SIMPLIFIED_COLUMNS` and `STATUS_TO_SIMPLIFIED` constants alongside existing `KANBAN_COLUMNS`. The board component selects which column set to use based on a `columnView` state in `KanbanBoardContext`. No database, API, or algorithm changes.

**Tech Stack:** Next.js 15, React, TypeScript, shadcn/ui Switch component, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/kanban-columns.ts` | Add `SIMPLIFIED_COLUMNS` array and `STATUS_TO_SIMPLIFIED` mapping |
| Modify | `src/lib/__tests__/kanban-columns.test.ts` | Tests for new exports |
| Modify | `src/hooks/contexts/kanban-board-context.tsx` | Add `columnView` / `setColumnView` state |
| Modify | `src/components/kanban/kanban-header.tsx` | Add Detailed View toggle switch |
| Modify | `src/components/kanban/kanban-board.tsx` | Use active column set for grouping, scroll, and dnd gating |
| Modify | `src/components/kanban/protected-kanban-board.tsx` | Set default `columnView` based on auth state |

---

### Task 1: Add SIMPLIFIED_COLUMNS and STATUS_TO_SIMPLIFIED

**Files:**
- Modify: `src/lib/kanban-columns.ts`
- Test: `src/lib/__tests__/kanban-columns.test.ts`

- [ ] **Step 1: Write failing tests for SIMPLIFIED_COLUMNS and STATUS_TO_SIMPLIFIED**

Add these tests to the bottom of `src/lib/__tests__/kanban-columns.test.ts`:

```typescript
import { SIMPLIFIED_COLUMNS, STATUS_TO_SIMPLIFIED } from '../kanban-columns';

describe('SIMPLIFIED_COLUMNS', () => {
  it('has exactly 13 columns', () => {
    expect(SIMPLIFIED_COLUMNS.length).toBe(13);
  });

  it('starts with unassigned and ends with lawWithoutSignature', () => {
    expect(SIMPLIFIED_COLUMNS[0].id).toBe('unassigned');
    expect(SIMPLIFIED_COLUMNS[SIMPLIFIED_COLUMNS.length - 1].id).toBe('lawWithoutSignature');
  });

  it('each column has id and title', () => {
    for (const col of SIMPLIFIED_COLUMNS) {
      expect(typeof col.id).toBe('string');
      expect(col.id.length).toBeGreaterThan(0);
      expect(typeof col.title).toBe('string');
      expect(col.title.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = SIMPLIFIED_COLUMNS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains key phases in order', () => {
    const ids = SIMPLIFIED_COLUMNS.map((c) => c.id);
    const waiting = ids.indexOf('simpleWaiting');
    const scheduled = ids.indexOf('simpleScheduled');
    const crossoverWaiting = ids.indexOf('simpleCrossoverWaiting');
    const crossoverScheduled = ids.indexOf('simpleCrossoverScheduled');
    const conference = ids.indexOf('passedCommittees');
    const governor = ids.indexOf('transmittedGovernor');

    expect(waiting).toBeGreaterThan(0);
    expect(scheduled).toBeGreaterThan(waiting);
    expect(crossoverWaiting).toBeGreaterThan(scheduled);
    expect(crossoverScheduled).toBeGreaterThan(crossoverWaiting);
    expect(conference).toBeGreaterThan(crossoverScheduled);
    expect(governor).toBeGreaterThan(conference);
  });
});

describe('STATUS_TO_SIMPLIFIED', () => {
  it('maps every BillStatus to a valid simplified column', () => {
    const simplifiedIds = new Set(SIMPLIFIED_COLUMNS.map((c) => c.id));
    const allStatuses = [
      'unassigned', 'introduced', 'scheduled1', 'scheduled2', 'scheduled3',
      'waiting2', 'waiting3', 'deferred1', 'deferred2', 'deferred3',
      'crossoverWaiting1', 'crossoverWaiting2', 'crossoverWaiting3',
      'crossoverScheduled1', 'crossoverScheduled2', 'crossoverScheduled3',
      'crossoverDeferred1', 'crossoverDeferred2', 'crossoverDeferred3',
      'passedCommittees', 'conferenceAssigned', 'conferenceScheduled',
      'conferenceDeferred', 'conferencePassed', 'transmittedGovernor',
      'vetoList', 'governorSigns', 'lawWithoutSignature',
    ];

    for (const status of allStatuses) {
      expect(STATUS_TO_SIMPLIFIED[status]).toBeDefined();
      expect(simplifiedIds.has(STATUS_TO_SIMPLIFIED[status])).toBe(true);
    }
  });

  it('maps waiting statuses to simpleWaiting', () => {
    expect(STATUS_TO_SIMPLIFIED['introduced']).toBe('simpleWaiting');
    expect(STATUS_TO_SIMPLIFIED['waiting2']).toBe('simpleWaiting');
    expect(STATUS_TO_SIMPLIFIED['waiting3']).toBe('simpleWaiting');
  });

  it('maps scheduled and deferred statuses to simpleScheduled', () => {
    expect(STATUS_TO_SIMPLIFIED['scheduled1']).toBe('simpleScheduled');
    expect(STATUS_TO_SIMPLIFIED['scheduled2']).toBe('simpleScheduled');
    expect(STATUS_TO_SIMPLIFIED['scheduled3']).toBe('simpleScheduled');
    expect(STATUS_TO_SIMPLIFIED['deferred1']).toBe('simpleScheduled');
    expect(STATUS_TO_SIMPLIFIED['deferred2']).toBe('simpleScheduled');
    expect(STATUS_TO_SIMPLIFIED['deferred3']).toBe('simpleScheduled');
  });

  it('maps crossover waiting statuses to simpleCrossoverWaiting', () => {
    expect(STATUS_TO_SIMPLIFIED['crossoverWaiting1']).toBe('simpleCrossoverWaiting');
    expect(STATUS_TO_SIMPLIFIED['crossoverWaiting2']).toBe('simpleCrossoverWaiting');
    expect(STATUS_TO_SIMPLIFIED['crossoverWaiting3']).toBe('simpleCrossoverWaiting');
  });

  it('maps crossover scheduled and deferred statuses to simpleCrossoverScheduled', () => {
    expect(STATUS_TO_SIMPLIFIED['crossoverScheduled1']).toBe('simpleCrossoverScheduled');
    expect(STATUS_TO_SIMPLIFIED['crossoverScheduled2']).toBe('simpleCrossoverScheduled');
    expect(STATUS_TO_SIMPLIFIED['crossoverScheduled3']).toBe('simpleCrossoverScheduled');
    expect(STATUS_TO_SIMPLIFIED['crossoverDeferred1']).toBe('simpleCrossoverScheduled');
    expect(STATUS_TO_SIMPLIFIED['crossoverDeferred2']).toBe('simpleCrossoverScheduled');
    expect(STATUS_TO_SIMPLIFIED['crossoverDeferred3']).toBe('simpleCrossoverScheduled');
  });

  it('maps conference and governor statuses to themselves', () => {
    expect(STATUS_TO_SIMPLIFIED['passedCommittees']).toBe('passedCommittees');
    expect(STATUS_TO_SIMPLIFIED['conferenceAssigned']).toBe('conferenceAssigned');
    expect(STATUS_TO_SIMPLIFIED['conferenceScheduled']).toBe('conferenceScheduled');
    expect(STATUS_TO_SIMPLIFIED['conferenceDeferred']).toBe('conferenceScheduled');
    expect(STATUS_TO_SIMPLIFIED['conferencePassed']).toBe('conferencePassed');
    expect(STATUS_TO_SIMPLIFIED['transmittedGovernor']).toBe('transmittedGovernor');
    expect(STATUS_TO_SIMPLIFIED['vetoList']).toBe('vetoList');
    expect(STATUS_TO_SIMPLIFIED['governorSigns']).toBe('governorSigns');
    expect(STATUS_TO_SIMPLIFIED['lawWithoutSignature']).toBe('lawWithoutSignature');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/__tests__/kanban-columns.test.ts`
Expected: FAIL — `SIMPLIFIED_COLUMNS` and `STATUS_TO_SIMPLIFIED` are not exported from `kanban-columns.ts`

- [ ] **Step 3: Implement SIMPLIFIED_COLUMNS and STATUS_TO_SIMPLIFIED**

Add to the bottom of `src/lib/kanban-columns.ts` (before the closing of the file, after the `COLUMN_INDEX` export):

```typescript
export const SIMPLIFIED_COLUMNS: KanbanColumnData[] = [
  { id: 'unassigned', title: 'Not Assigned' },
  { id: 'simpleWaiting', title: 'INTRODUCED & WAITING' },
  { id: 'simpleScheduled', title: 'SCHEDULED' },
  { id: 'simpleCrossoverWaiting', title: 'CROSSOVER & WAITING' },
  { id: 'simpleCrossoverScheduled', title: 'CROSSOVER SCHEDULED' },
  { id: 'passedCommittees', title: 'CONFERENCE' },
  { id: 'conferenceAssigned', title: 'AWAITING COMMITTEES' },
  { id: 'conferenceScheduled', title: 'SCHEDULED' },
  { id: 'conferencePassed', title: 'PASSED CONFERENCE' },
  { id: 'transmittedGovernor', title: 'TRANSMITTED TO GOVERNOR' },
  { id: 'vetoList', title: 'GOVERNOR VETOED' },
  { id: 'governorSigns', title: 'GOVERNOR SIGNED INTO LAW' },
  { id: 'lawWithoutSignature', title: 'LAW WITHOUT SIGNATURE' },
];

// Maps every BillStatus to the simplified column it belongs to
export const STATUS_TO_SIMPLIFIED: Record<string, string> = {
  unassigned: 'unassigned',
  // Pre-crossover waiting
  introduced: 'simpleWaiting',
  waiting2: 'simpleWaiting',
  waiting3: 'simpleWaiting',
  // Pre-crossover scheduled (includes deferred)
  scheduled1: 'simpleScheduled',
  scheduled2: 'simpleScheduled',
  scheduled3: 'simpleScheduled',
  deferred1: 'simpleScheduled',
  deferred2: 'simpleScheduled',
  deferred3: 'simpleScheduled',
  // Crossover waiting
  crossoverWaiting1: 'simpleCrossoverWaiting',
  crossoverWaiting2: 'simpleCrossoverWaiting',
  crossoverWaiting3: 'simpleCrossoverWaiting',
  // Crossover scheduled (includes deferred)
  crossoverScheduled1: 'simpleCrossoverScheduled',
  crossoverScheduled2: 'simpleCrossoverScheduled',
  crossoverScheduled3: 'simpleCrossoverScheduled',
  crossoverDeferred1: 'simpleCrossoverScheduled',
  crossoverDeferred2: 'simpleCrossoverScheduled',
  crossoverDeferred3: 'simpleCrossoverScheduled',
  // Conference (1:1)
  passedCommittees: 'passedCommittees',
  conferenceAssigned: 'conferenceAssigned',
  conferenceScheduled: 'conferenceScheduled',
  conferenceDeferred: 'conferenceScheduled',
  conferencePassed: 'conferencePassed',
  // Governor (1:1)
  transmittedGovernor: 'transmittedGovernor',
  vetoList: 'vetoList',
  governorSigns: 'governorSigns',
  lawWithoutSignature: 'lawWithoutSignature',
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/__tests__/kanban-columns.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/kanban-columns.ts src/lib/__tests__/kanban-columns.test.ts
git commit -m "feat: add SIMPLIFIED_COLUMNS and STATUS_TO_SIMPLIFIED mapping"
```

---

### Task 2: Add columnView state to KanbanBoardContext

**Files:**
- Modify: `src/hooks/contexts/kanban-board-context.tsx`

- [ ] **Step 1: Add columnView state to context type and provider**

In `src/hooks/contexts/kanban-board-context.tsx`, update the interface to add the new fields:

```typescript
interface KanbanBoardContextType {
  view: 'kanban' | 'spreadsheet' | 'admin' | 'approvals' | 'supervisor';
  setView: Dispatch<SetStateAction<'kanban' | 'spreadsheet' | 'admin' | 'approvals' | 'supervisor'>>;
  columnView: 'detailed' | 'simplified';
  setColumnView: Dispatch<SetStateAction<'detailed' | 'simplified'>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  selectedTagIds: string[];
  setSelectedTagIds: Dispatch<SetStateAction<string[]>>;
  selectedYears: number[];
  setSelectedYears: Dispatch<SetStateAction<number[]>>;
}
```

In the `KanbanBoardProvider` function, add the state:

```typescript
const [columnView, setColumnView] = useState<'detailed' | 'simplified'>('simplified');
```

Update the Provider value to include `columnView, setColumnView`:

```typescript
<KanbanBoardContext.Provider value={{ searchQuery, setSearchQuery, view, setView, columnView, setColumnView, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears }}>
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (no type errors — `columnView` and `setColumnView` are now available but not yet consumed)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/contexts/kanban-board-context.tsx
git commit -m "feat: add columnView state to KanbanBoardContext"
```

---

### Task 3: Add toggle switch to KanbanHeader

**Files:**
- Modify: `src/components/kanban/kanban-header.tsx`

- [ ] **Step 1: Add the Detailed View toggle to the header**

In `src/components/kanban/kanban-header.tsx`, add `columnView` and `setColumnView` to the destructured context:

Change this line:
```typescript
const { selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears } = useKanbanBoard();
```

To:
```typescript
const { columnView, setColumnView, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears } = useKanbanBoard();
```

Add the toggle switch. Insert it as a new element inside the right-side `div` (the one with `className='flex items-center space-x-2 mr-4 py-2'`), before the `<TagFilterList>` component:

```tsx
<div className='flex items-center space-x-2'>
  <Switch
    id='column-view'
    checked={columnView === 'detailed'}
    onCheckedChange={(checked) => setColumnView(checked ? 'detailed' : 'simplified')}
  />
  <Label htmlFor='column-view' className='text-md'>Detailed View</Label>
</div>
```

- [ ] **Step 2: Verify the dev server renders correctly**

Run: `npm run dev` (if not already running)
Open `http://localhost:9002` in a browser. Verify:
- The "Detailed View" toggle switch appears in the header toolbar
- Toggling it on/off does not crash the page (the board doesn't change yet — that's Task 5)

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/kanban-header.tsx
git commit -m "feat: add Detailed View toggle switch to kanban header"
```

---

### Task 4: Set default columnView based on auth state

**Files:**
- Modify: `src/components/kanban/protected-kanban-board.tsx`

- [ ] **Step 1: Import setColumnView and set default on mount**

In `src/components/kanban/protected-kanban-board.tsx`, add `useEffect` to the React import:

```typescript
import React, { useEffect } from 'react';
```

Update the destructured context to include `setColumnView`:

Change:
```typescript
const { view } = useKanbanBoard();
```

To:
```typescript
const { view, setColumnView } = useKanbanBoard();
```

Add a `useEffect` after the existing hook calls (after the `useTrackedBills` line) to set the default for authenticated tenant members:

```typescript
useEffect(() => {
  if (user && activeTenant) {
    setColumnView('detailed');
  }
}, [user, activeTenant, setColumnView]);
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:9002`. Verify:
- As a public user (not logged in): toggle defaults to OFF (simplified)
- As an authenticated tenant member: toggle defaults to ON (detailed)
- Both users can still toggle freely

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/protected-kanban-board.tsx
git commit -m "feat: default columnView to detailed for authenticated tenant members"
```

---

### Task 5: Wire up KanbanBoard to use active column set

**Files:**
- Modify: `src/components/kanban/kanban-board.tsx`

- [ ] **Step 1: Update imports and read columnView from context**

In `src/components/kanban/kanban-board.tsx`, update the import from `kanban-columns.ts`:

Change:
```typescript
import { KANBAN_COLUMNS, COLUMN_TITLES } from '@/lib/kanban-columns';
```

To:
```typescript
import { KANBAN_COLUMNS, COLUMN_TITLES, SIMPLIFIED_COLUMNS, STATUS_TO_SIMPLIFIED } from '@/lib/kanban-columns';
```

Update the destructured context:

Change:
```typescript
const { searchQuery, selectedTagIds, selectedYears } = useKanbanBoard();
```

To:
```typescript
const { searchQuery, selectedTagIds, selectedYears, columnView } = useKanbanBoard();
```

- [ ] **Step 2: Compute active column set and scroll indices**

Replace the static index constants at the top of the file (lines 19-22):

```typescript
const introducedIdx = KANBAN_COLUMNS.findIndex((col) => col.id === 'introduced');
const crossoverIdx = KANBAN_COLUMNS.findIndex((col) => col.id === 'crossoverWaiting1');
const conferenceIdx = KANBAN_COLUMNS.findIndex((col) => col.id === 'conferenceAssigned');
const governorIdx = KANBAN_COLUMNS.findIndex((col) => col.id === 'transmittedGovernor');
```

Remove these 4 lines (they'll become dynamic inside the component).

Inside the component function body, after the existing hook calls and before the scroll handler section, add:

```typescript
const activeColumns = columnView === 'simplified' ? SIMPLIFIED_COLUMNS : KANBAN_COLUMNS;
const isSimplified = columnView === 'simplified';

const introducedIdx = activeColumns.findIndex((col) =>
  col.id === (isSimplified ? 'simpleWaiting' : 'introduced')
);
const crossoverIdx = activeColumns.findIndex((col) =>
  col.id === (isSimplified ? 'simpleCrossoverWaiting' : 'crossoverWaiting1')
);
const conferenceIdx = activeColumns.findIndex((col) =>
  col.id === 'conferenceAssigned'
);
const governorIdx = activeColumns.findIndex((col) =>
  col.id === 'transmittedGovernor'
);
```

- [ ] **Step 3: Update columnRefs to use activeColumns length**

Change:
```typescript
const columnRefs = useRef<(HTMLDivElement | null)[]>(
  new Array(KANBAN_COLUMNS.length).fill(null)
);
```

To:
```typescript
const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
```

Then add a line right after to keep it sized correctly (this avoids stale refs when toggling):
```typescript
columnRefs.current.length = activeColumns.length;
```

- [ ] **Step 4: Update billsByColumn memo to use active column set and mapping**

Replace the entire `billsByColumn` useMemo (lines 164-222) with:

```typescript
const billsByColumn = useMemo(() => {
  const grouped = Object.fromEntries(
    activeColumns.map(c => [c.id, [] as Bill[]])
  ) as Record<string, Bill[]>;

  let items = (searchQuery.trim() && filteredBills) ? filteredBills : bills;

  // Filter by selected tags if any are selected
  if (selectedTagIds && selectedTagIds.length > 0) {
    items = items.filter((bill) => {
      const billTagIds = bill.tags?.map(tag => tag.id) || [];
      return billTagIds.some(tagId => selectedTagIds.includes(tagId));
    });
  }

  // Filter by selected years if any are selected
  if (selectedYears && selectedYears.length > 0) {
    items = items.filter((bill) => {
      const billYear = bill.year;
      if (billYear === null || billYear === undefined) {
        return false;
      }
      const normalizedBillYear = typeof billYear === 'string' ? parseInt(billYear, 10) : billYear;
      return selectedYears.includes(normalizedBillYear);
    });
  }

  const fallbackId = activeColumns.find(c => c.id === 'unassigned')?.id
                   ?? activeColumns[0].id;

  // Group bills into columns
  for (const bill of items) {
    let key: string;
    if (isSimplified) {
      key = STATUS_TO_SIMPLIFIED[bill.current_bill_status] ?? fallbackId;
    } else {
      const valid = activeColumns.some(c => c.id === bill.current_bill_status);
      key = valid ? bill.current_bill_status : fallbackId;
    }
    if (grouped[key]) {
      grouped[key].push(bill);
    } else {
      grouped[fallbackId]?.push(bill);
    }
  }

  // Sort each column's bills by latest status update date (most recent first)
  Object.keys(grouped).forEach((status) => {
    grouped[status].sort((a, b) => {
      const getLatestUpdateDate = (bill: Bill): number => {
        if (bill.latest_update && bill.latest_update.date) {
          const date = new Date(bill.latest_update.date);
          return date.getTime();
        }
        return 0;
      };

      const dateA = getLatestUpdateDate(a);
      const dateB = getLatestUpdateDate(b);
      return dateB - dateA;
    });
  });

  return grouped;
}, [bills, filteredBills, searchQuery, selectedTagIds, selectedYears, activeColumns, isSimplified]);
```

- [ ] **Step 5: Update tempBillsByColumn memo**

Replace the `tempBillsByColumn` useMemo (lines 229-243) with:

```typescript
const tempBillsByColumn = useMemo(() => {
  const grouped: Record<string, TempBill[]> = {};
  activeColumns.forEach((c) => (grouped[c.id] = []));

  tempBills.forEach((tb) => {
    if (searchQuery.trim() && !visibleBillIds.has(tb.id)) {
      return;
    }
    let key: string;
    if (isSimplified) {
      key = STATUS_TO_SIMPLIFIED[tb.current_status] ?? 'unassigned';
    } else {
      key = tb.current_status as string;
    }
    grouped[key]?.push(tb);
  });

  return grouped;
}, [tempBills, searchQuery, visibleBillIds, activeColumns, isSimplified]);
```

- [ ] **Step 6: Update search scroll-to-column to use active column set**

In the "Navigate to first search result" useEffect (around line 131), change:

```typescript
const columnIndex = KANBAN_COLUMNS.findIndex(col => col.id === billStatus);
```

To:

```typescript
let columnIndex: number;
if (isSimplified) {
  const simplifiedId = STATUS_TO_SIMPLIFIED[billStatus] ?? billStatus;
  columnIndex = activeColumns.findIndex(col => col.id === simplifiedId);
} else {
  columnIndex = activeColumns.findIndex(col => col.id === billStatus);
}
```

Add `isSimplified` and `activeColumns` to that useEffect's dependency array:
```typescript
}, [filteredBills, searchQuery, scrollToColumnByIndex, isSimplified, activeColumns]);
```

- [ ] **Step 7: Update handleTempCardClick to use active column set**

In `handleTempCardClick`, change:

```typescript
const currentStatusColumnIndex = KANBAN_COLUMNS.findIndex(
  col => col.id === tempBill.proposed_status
);
```

To:

```typescript
let targetId: string;
if (isSimplified) {
  targetId = STATUS_TO_SIMPLIFIED[tempBill.proposed_status] ?? tempBill.proposed_status;
} else {
  targetId = tempBill.proposed_status;
}
const currentStatusColumnIndex = activeColumns.findIndex(
  col => col.id === targetId
);
```

Add `isSimplified` and `activeColumns` to the dependency array:
```typescript
}, [scrollToColumnByIndex, isSimplified, activeColumns]);
```

- [ ] **Step 8: Update render to use activeColumns and gate drag-and-drop on columnView**

The key rendering change: when `isSimplified` is true, always use the read-only rendering path (no `DragDropContext`), regardless of the `readOnly` prop.

Replace the return statement's conditional rendering. The condition that decides read-only vs DnD changes from `{readOnly ? (` to `{(readOnly || isSimplified) ? (`.

Change:
```typescript
{readOnly ? (
```

To:
```typescript
{(readOnly || isSimplified) ? (
```

Then in BOTH the read-only branch and the DnD branch, replace all 3 occurrences of `KANBAN_COLUMNS.map((column, idx)` with `activeColumns.map((column, idx)`.

In the read-only branch (around line 409):
```typescript
{activeColumns.map((column, idx) => (
```

In the DnD branch (around line 458):
```typescript
{activeColumns.map((column, idx) => (
```

Also update the column lookups for `billsByColumn` and `tempBillsByColumn` in both branches. Change all instances of:
```typescript
bills={billsByColumn[column.id as BillStatus] || []}
```
To:
```typescript
bills={billsByColumn[column.id] || []}
```

And change all instances of:
```typescript
pendingTempBills={tempBillsByColumn[column.id as BillStatus] || []}
```
To:
```typescript
pendingTempBills={tempBillsByColumn[column.id] || []}
```

- [ ] **Step 9: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 10: Run all tests**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 11: Verify in browser**

Open `http://localhost:9002`. Test:
- **Public user (not logged in):** Sees simplified view (13 columns) by default. Toggle switches to detailed (25 columns). No drag-and-drop in either view.
- **Authenticated tenant member:** Sees detailed view by default. Toggle switches to simplified. Drag-and-drop works in detailed view, disabled in simplified.
- **Search:** Typing a bill number scrolls to the correct column in both views.
- **Tag/year filters:** Work correctly in both views.
- **Quick-scroll buttons:** Jump to the right column in both views.

- [ ] **Step 12: Commit**

```bash
git add src/components/kanban/kanban-board.tsx
git commit -m "feat: wire kanban board to use active column set based on columnView toggle"
```
