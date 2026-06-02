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
type SortKey = 'bill_number' | 'current_bill_status' | 'bill_title' | 'committee_assignment' | 'introducer' | 'year' | 'next_deadline';
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

// ─── Sort Header ─────────────────────────────────────────────

interface SortHeaderProps {
  label: string;
  columnKey: SortKey;
  className?: string;
  sticky?: boolean;
  sortKey: SortKey | null;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}

function SortHeader({ label, columnKey, className, sticky, sortKey, sortDirection, onSort }: SortHeaderProps) {
  const isActive = sortKey === columnKey;
  return (
    <TableHead
      className={`${className ?? ''} ${sticky ? 'sticky left-0 z-20 bg-background' : ''} py-4 cursor-pointer select-none hover:bg-muted/50 transition-colors`}
      onClick={() => onSort(columnKey)}
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
}

// ─── Component ───────────────────────────────────────────────

export function KanbanSpreadsheet() {
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

  const today = new Date().toISOString().split('T')[0];

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
        return selectedYears.includes(bill.year);
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

  return (
    <div className="h-full w-full overflow-auto">
      <div className="min-w-max p-4">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              <SortHeader label="Bill #" columnKey="bill_number" className="w-[8rem]" sticky sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
              <SortHeader label="Current Status" columnKey="current_bill_status" className="w-[10rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
              <SortHeader label="Bill Title" columnKey="bill_title" className="min-w-[20rem] max-w-[30rem] w-[30rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
              <TableHead className="min-w-[15rem] max-w-[30rem] w-[30rem] py-4">Policy Description</TableHead>
              <SortHeader label="Committee" columnKey="committee_assignment" className="w-[12rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
              <SortHeader label="Introducer" columnKey="introducer" className="w-[12rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
              <SortHeader label="Year" columnKey="year" className="w-[6rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
              <SortHeader label="Next Deadline" columnKey="next_deadline" className="w-[10rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
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
                  ? Math.ceil((new Date(deadline.date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
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
