# Spreadsheet Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the spreadsheet view to use BillsContext data directly (eliminating N individual API calls), add sortable column headers, dead/alive indicators, next deadline column, tag row styling, and a dead status filter.

**Architecture:** The spreadsheet component stops fetching its own data and instead consumes `bills` from `useBills()`. A single `useMemo` handles filtering (search, tags, years, dead status) and sorting. The `introducer` field is added to the base `Bill` type so it flows through the existing `/api/bills` endpoint. Dead filter state is added to `KanbanBoardContext` and surfaced in the existing filter popover.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui, lucide-react icons

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/legislation.ts` | Modify | Add `introducer` to `Bill` interface |
| `src/services/data/legislation.ts` | Modify | Include `introducer` in `baseBill` object |
| `src/hooks/contexts/kanban-board-context.tsx` | Modify | Add `deadFilter` state |
| `src/components/tags/tag-filter-list.tsx` | Modify | Add dead filter section to filter popover |
| `src/components/kanban/kanban-header.tsx` | Modify | Pass dead filter props to `TagFilterList` |
| `src/components/kanban/kanban-spreadsheet.tsx` | Rewrite | Context-driven data, sorting, filtering, new columns, tag rows |

---

### Task 1: Add `introducer` to the Bill type and data converter

**Files:**
- Modify: `src/types/legislation.ts:40-64` (Bill interface)
- Modify: `src/services/data/legislation.ts:1204-1228` (baseBill object)

- [ ] **Step 1: Add `introducer` to the `Bill` interface**

In `src/types/legislation.ts`, add `introducer` as an optional string field to the `Bill` interface, after `committee_assignment`:

```typescript
// In the Bill interface, after line 52 (committee_assignment):
  introducer?: string;
```

- [ ] **Step 2: Include `introducer` in the `baseBill` object**

In `src/services/data/legislation.ts`, inside the `baseBill` object (around line 1216), add `introducer` after the `committee_assignment` line:

```typescript
    committee_assignment: bill.committee_assignment ?? null,
    introducer: bill.introducer ?? '',
    year: bill.year ?? null,
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — `introducer` is optional on `Bill` and already exists on `BillDetails`, so no consumers break.

- [ ] **Step 4: Commit**

```bash
git add src/types/legislation.ts src/services/data/legislation.ts
git commit -m "feat: add introducer field to base Bill type"
```

---

### Task 2: Add dead filter state to KanbanBoardContext

**Files:**
- Modify: `src/hooks/contexts/kanban-board-context.tsx`

- [ ] **Step 1: Add `deadFilter` to the context type, state, and provider value**

In `src/hooks/contexts/kanban-board-context.tsx`, make these changes:

Add to the `KanbanBoardContextType` interface:
```typescript
  deadFilter: 'all' | 'dead' | 'alive';
  setDeadFilter: Dispatch<SetStateAction<'all' | 'dead' | 'alive'>>;
```

Add state in `KanbanBoardProvider`:
```typescript
  const [deadFilter, setDeadFilter] = useState<'all' | 'dead' | 'alive'>('all');
```

Add to the Provider's value object:
```typescript
  deadFilter, setDeadFilter
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — new fields are additive, no existing consumers break.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/contexts/kanban-board-context.tsx
git commit -m "feat: add deadFilter state to KanbanBoardContext"
```

---

### Task 3: Add dead filter UI to the filter popover

**Files:**
- Modify: `src/components/tags/tag-filter-list.tsx`
- Modify: `src/components/kanban/kanban-header.tsx`

- [ ] **Step 1: Add dead filter props to `TagFilterList`**

In `src/components/tags/tag-filter-list.tsx`, update the `TagFilterListProps` interface:

```typescript
interface TagFilterListProps {
  selectedTagIds: string[];
  onTagToggle: (tagId: string) => void;
  selectedYears: number[];
  onYearToggle: (year: number) => void;
  deadFilter: 'all' | 'dead' | 'alive';
  onDeadFilterChange: (value: 'all' | 'dead' | 'alive') => void;
  onClearFilters: () => void;
}
```

Update the destructured props:
```typescript
export function TagFilterList({
  selectedTagIds,
  onTagToggle,
  selectedYears,
  onYearToggle,
  deadFilter,
  onDeadFilterChange,
  onClearFilters,
}: TagFilterListProps) {
```

Update `totalFiltersCount` to include the dead filter:
```typescript
  const totalFiltersCount = selectedTagIds.length + selectedYears.length + (deadFilter !== 'all' ? 1 : 0);
```

- [ ] **Step 2: Add the dead filter section inside the popover**

In the popover content, add a "STATUS" section before the "YEAR" section (inside the `<div className="space-y-4">` block, before the years section):

```tsx
                  {/* Dead/Alive Status Section */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">STATUS</h4>
                    <div className="space-y-1">
                      {(['all', 'alive', 'dead'] as const).map((value) => {
                        const isSelected = deadFilter === value;
                        const label = value === 'all' ? 'All Bills' : value === 'alive' ? 'Alive' : 'Dead';
                        return (
                          <div
                            key={value}
                            onClick={() => onDeadFilterChange(value)}
                            className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer transition-colors"
                          >
                            <div className="flex items-center justify-center w-4 h-4">
                              {isSelected && <Check className="h-4 w-4 text-primary" />}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {value === 'dead' && <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />}
                              {value === 'alive' && <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />}
                              <span className="text-sm">{label}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
```

- [ ] **Step 3: Pass dead filter props from `KanbanHeader`**

In `src/components/kanban/kanban-header.tsx`, add `deadFilter` and `setDeadFilter` to the destructured `useKanbanBoard()` call:

```typescript
  const { columnView, setColumnView, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears, deadFilter, setDeadFilter } = useKanbanBoard();
```

Add the new props to the `<TagFilterList>` component:

```tsx
            <TagFilterList
              selectedTagIds={selectedTagIds}
              onTagToggle={(tagId: string) => {
                setSelectedTagIds((prev) =>
                  prev.includes(tagId)
                    ? prev.filter((id) => id !== tagId)
                    : [...prev, tagId]
                );
              }}
              selectedYears={selectedYears}
              onYearToggle={(year: number) => {
                setSelectedYears((prev) =>
                  prev.includes(year)
                    ? prev.filter((y) => y !== year)
                    : [...prev, year]
                );
              }}
              deadFilter={deadFilter}
              onDeadFilterChange={setDeadFilter}
              onClearFilters={() => {
                setSelectedTagIds([]);
                setSelectedYears([]);
                setDeadFilter('all');
              }}
            />
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/tags/tag-filter-list.tsx src/components/kanban/kanban-header.tsx
git commit -m "feat: add dead/alive filter to filter popover"
```

---

### Task 4: Rewrite the spreadsheet component

**Files:**
- Rewrite: `src/components/kanban/kanban-spreadsheet.tsx`

This is the main task. The entire file is replaced.

- [ ] **Step 1: Write the full spreadsheet component**

Replace the contents of `src/components/kanban/kanban-spreadsheet.tsx` with:

```tsx
import React, { useMemo, useState, useCallback } from 'react';
import type { Bill } from '@/types/legislation';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useBills } from '@/hooks/contexts/bills-context';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { formatBillStatusName } from '@/lib/utils';
import { getNextDeadline } from '@/lib/dead-bill';
import type { SessionDeadlines, DeadlineEntry } from '@/lib/dead-bill';
import type { BillStatus as DBBillStatus } from '@/db/types';
import deadlinesJson from '@/data/session-deadlines-2026.json';
import { ArrowUp, ArrowDown, ArrowUpDown, Clock } from 'lucide-react';

// ─── Sort Types ──────────────────────────────────────────────
type SortKey = 'bill_number' | 'current_bill_status' | 'bill_title' | 'description' | 'committee_assignment' | 'introducer' | 'year' | 'next_deadline';
type SortDirection = 'asc' | 'desc';

// ─── Helpers ─────────────────────────────────────────────────

function computeDeadline(bill: Bill, today: string): DeadlineEntry | null {
  if (bill.dead || !bill.committee_assignment || !bill.current_bill_status) return null;
  return getNextDeadline(
    bill.bill_number,
    bill.current_bill_status as DBBillStatus,
    bill.committee_assignment,
    deadlinesJson as SessionDeadlines,
    today,
  );
}

function compareBills(
  a: Bill,
  b: Bill,
  key: SortKey,
  direction: SortDirection,
  deadlineCache: Map<string, DeadlineEntry | null>,
): number {
  let result: number;

  switch (key) {
    case 'bill_number': {
      const prefixA = a.bill_number.replace(/\d/g, '');
      const prefixB = b.bill_number.replace(/\d/g, '');
      if (prefixA !== prefixB) {
        result = prefixA.localeCompare(prefixB);
      } else {
        const numA = parseInt(a.bill_number.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.bill_number.replace(/\D/g, ''), 10) || 0;
        result = numA - numB;
      }
      break;
    }
    case 'year': {
      const yA = a.year ?? (direction === 'asc' ? Infinity : -Infinity);
      const yB = b.year ?? (direction === 'asc' ? Infinity : -Infinity);
      result = (yA as number) - (yB as number);
      break;
    }
    case 'next_deadline': {
      const dA = deadlineCache.get(a.id)?.date ?? null;
      const dB = deadlineCache.get(b.id)?.date ?? null;
      if (dA === null && dB === null) result = 0;
      else if (dA === null) result = 1; // nulls last
      else if (dB === null) result = -1;
      else result = dA.localeCompare(dB);
      break;
    }
    default: {
      const valA = (a[key] as string | null) ?? '';
      const valB = (b[key] as string | null) ?? '';
      result = valA.localeCompare(valB);
      break;
    }
  }

  return direction === 'asc' ? result : -result;
}

// ─── Component ───────────────────────────────────────────────

interface KanbanSpreadsheetProps {
  isPublicView?: boolean;
}

export function KanbanSpreadsheet({ isPublicView = false }: KanbanSpreadsheetProps) {
  const { bills, loadingBills } = useBills();
  const { searchQuery, selectedTagIds, selectedYears, deadFilter } = useKanbanBoard();

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }, [sortKey]);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Pre-compute deadlines for all bills so sorting can access them
  const deadlineCache = useMemo(() => {
    const cache = new Map<string, DeadlineEntry | null>();
    for (const bill of bills) {
      cache.set(bill.id, computeDeadline(bill, today));
    }
    return cache;
  }, [bills, today]);

  const displayBills = useMemo(() => {
    let items = bills;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(bill =>
        bill.bill_number.toLowerCase().includes(q) ||
        bill.bill_title.toLowerCase().includes(q) ||
        bill.description.toLowerCase().includes(q)
      );
    }

    // Tag filter
    if (selectedTagIds.length > 0) {
      items = items.filter(bill => {
        const billTagIds = bill.tags?.map(tag => tag.id) || [];
        return billTagIds.some(tagId => selectedTagIds.includes(tagId));
      });
    }

    // Year filter
    if (selectedYears.length > 0) {
      items = items.filter(bill => {
        if (bill.year === null || bill.year === undefined) return false;
        const y = typeof bill.year === 'string' ? parseInt(bill.year as unknown as string, 10) : bill.year;
        return selectedYears.includes(y);
      });
    }

    // Dead filter
    if (deadFilter === 'dead') {
      items = items.filter(bill => bill.dead);
    } else if (deadFilter === 'alive') {
      items = items.filter(bill => !bill.dead);
    }

    // Sort
    if (sortKey) {
      items = [...items].sort((a, b) => compareBills(a, b, sortKey, sortDirection, deadlineCache));
    }

    return items;
  }, [bills, searchQuery, selectedTagIds, selectedYears, deadFilter, sortKey, sortDirection, deadlineCache]);

  const totalColumns = 9;

  // ─── Sub-components ────────────────────────────────────────

  const SortHeader = ({ label, columnKey, className, sticky }: { label: string; columnKey: SortKey; className?: string; sticky?: boolean }) => {
    const isActive = sortKey === columnKey;
    return (
      <TableHead
        className={`${className ?? ''} ${sticky ? 'sticky left-0 z-20 bg-background' : ''} py-4 cursor-pointer select-none hover:bg-muted/50 transition-colors`}
        onClick={() => handleSort(columnKey)}
      >
        <div className="flex items-center gap-1">
          {label}
          {isActive ? (
            sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </div>
      </TableHead>
    );
  };

  return (
    <div className="h-full w-full overflow-auto">
      <div className="min-w-max p-4">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              <SortHeader label="Bill #" columnKey="bill_number" className="w-[8rem]" sticky />
              <SortHeader label="Current Status" columnKey="current_bill_status" className="w-[10rem]" />
              <SortHeader label="Bill Title" columnKey="bill_title" className="min-w-[20rem] max-w-[30rem] w-[30rem]" />
              <SortHeader label="Policy Description" columnKey="description" className="min-w-[15rem] max-w-[30rem] w-[30rem]" />
              <SortHeader label="Committee" columnKey="committee_assignment" className="w-[12rem]" />
              <SortHeader label="Introducer" columnKey="introducer" className="w-[12rem]" />
              <SortHeader label="Year" columnKey="year" className="w-[6rem]" />
              <SortHeader label="Next Deadline" columnKey="next_deadline" className="w-[10rem]" />
              <TableHead className="w-[15rem] py-4">Tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingBills ? (
              <TableRow>
                <TableCell colSpan={totalColumns} className="text-center py-8 text-muted-foreground">
                  Loading bills...
                </TableCell>
              </TableRow>
            ) : displayBills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColumns} className="text-center py-8 text-muted-foreground">
                  {searchQuery.trim() ? `No bills found matching "${searchQuery}"` : 'No bills available'}
                </TableCell>
              </TableRow>
            ) : (
              displayBills.map((bill) => {
                const deadline = deadlineCache.get(bill.id) ?? null;
                const deadlineDaysAway = deadline
                  ? Math.ceil((new Date(deadline.date + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                  : null;
                const isUrgent = deadlineDaysAway !== null && deadlineDaysAway <= 7;
                const hasTags = bill.tags && bill.tags.length > 0;
                const firstTagColor = hasTags ? (bill.tags![0].color || '#3b82f6') : null;

                return (
                  <React.Fragment key={bill.id}>
                    {/* Tag row — rendered above data row for bills with tags */}
                    {hasTags && (
                      <TableRow className="border-b-0 hover:bg-transparent">
                        <TableCell colSpan={totalColumns} className="py-1 px-4">
                          <div className="flex flex-wrap gap-1">
                            {bill.tags!.map((tag) => (
                              <Badge
                                key={tag.id}
                                variant="outline"
                                style={{
                                  backgroundColor: tag.color || '#3b82f6',
                                  color: 'white',
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                }}
                                className="text-[10px] rounded-md"
                              >
                                {tag.name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}

                    {/* Data row */}
                    <TableRow
                      style={firstTagColor ? { backgroundColor: `${firstTagColor}14` } : undefined}
                    >
                      {/* Bill # with dead/alive dot */}
                      <TableCell className="sticky left-0 z-20 w-[8rem] py-4" style={firstTagColor ? { backgroundColor: `${firstTagColor}14` } : undefined}>
                        <div className="flex items-center gap-2">
                          {bill.dead ? (
                            <span className="h-2.5 w-2.5 rounded-full bg-red-500 flex-shrink-0" />
                          ) : (
                            <span className="h-2.5 w-2.5 rounded-full bg-green-500 flex-shrink-0 animate-pulse" />
                          )}
                          {bill.bill_number}
                        </div>
                      </TableCell>

                      <TableCell className="w-[10rem] py-4">
                        {formatBillStatusName(bill.current_bill_status)}
                      </TableCell>

                      <TableCell className="text-wrap min-w-[20rem] max-w-[30rem] w-[30rem] py-4">
                        {bill.bill_title}
                      </TableCell>

                      <TableCell className="text-wrap min-w-[15rem] max-w-[30rem] w-[30rem] py-4">
                        {bill.description}
                      </TableCell>

                      <TableCell className="text-wrap w-[12rem] py-4">
                        {bill.committee_assignment || 'N/A'}
                      </TableCell>

                      <TableCell className="text-wrap w-[12rem] py-4">
                        {bill.introducer || 'N/A'}
                      </TableCell>

                      <TableCell className="w-[6rem] py-4">
                        {bill.year ?? 'N/A'}
                      </TableCell>

                      {/* Next Deadline */}
                      <TableCell className="w-[10rem] py-4">
                        {deadline ? (
                          <div className={`flex items-center gap-1 text-sm ${isUrgent ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                            <div>
                              <div>{new Date(deadline.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                              <div className="text-xs">{deadline.name}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Tags cell — shows "No tags" placeholder for bills without tags */}
                      <TableCell className="w-[15rem] py-4">
                        {!hasTags && (
                          <span className="text-muted-foreground text-sm">No tags</span>
                        )}
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All existing tests pass (no test files modified).

- [ ] **Step 4: Commit**

```bash
git add src/components/kanban/kanban-spreadsheet.tsx
git commit -m "feat: rewrite spreadsheet to use BillsContext with sorting, filtering, deadlines"
```

---

### Task 5: Verify in the browser

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test the spreadsheet view**

Open the app in a browser, switch to the spreadsheet view, and verify:

1. Bills load instantly (no loading spinner for per-bill fetches)
2. Dead/alive dots appear next to each bill number (green pulsing for alive, static red for dead)
3. The "Introducer" column shows data
4. The "Next Deadline" column shows dates and deadline names (amber for urgent)
5. The "Year" column shows bill years
6. Tags appear as colored badges above each bill's data row
7. Rows with tags have a muted tint matching the first tag's color
8. Clicking sortable column headers sorts the table (arrow icons update)
9. Clicking the same header toggles between asc/desc
10. The filter popover includes a "STATUS" section with All/Alive/Dead options
11. Selecting "Dead" in the filter shows only dead bills
12. Selecting "Alive" shows only alive bills
13. Tag and year filters still work
14. Search query filters bills in the spreadsheet
15. "Clear All" in the filter popover also resets the dead filter

- [ ] **Step 3: Test public view**

View the app without being logged in and verify all columns render (no hidden columns since tracking was removed).
