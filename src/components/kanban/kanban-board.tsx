'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Bill, BillStatus, TempBill } from '@/types/legislation';
import { KANBAN_COLUMNS, COLUMN_TITLES, SIMPLIFIED_COLUMNS, STATUS_TO_SIMPLIFIED } from '@/lib/bills/kanban-columns';
import { ScrollBar } from '@/components/ui/scroll-area';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { searchBillsLocal } from '@/lib/bills/bill-search';
import { cn } from '@/lib/core/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RISE_IN, riseDelay } from '@/lib/core/motion';
import { filterBills, tagIdsOnBoard } from '@/lib/bills/bill-filters';
import { data as dataClient } from '@/lib/data-client';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useBillDialogParam } from '@/hooks/use-bill-dialog-param';
import { useToast } from '@/hooks/use-toast';
import { UrlBillDetailsDialog } from './url-bill-details-dialog';
import { Button } from '@/components/ui/button';
import { useBills } from '@/hooks/contexts/bills-context';
import KanbanBoardSkeleton from './skeletons/skeleton-board';
import { KanbanColumn } from './kanban-column';
import { useAuth } from '@/hooks/contexts/auth-context';


interface KanbanBoardProps {
  readOnly: boolean;
  onUnadopt?: (billId: string) => void;
  showUnadoptButton?: boolean;
  boardMode?: import('@/lib/bills/board-display').BoardMode;
  orgTestimonyBillIds?: Set<string>;
  trackedBillIds?: Set<string>;
  onTrackForSelf?: (bill: Bill) => void;
  /** Replaces opening the bill details dialog, e.g. the embed opens the bill in a new tab. */
  onCardClick?: (bill: Bill) => void;
}

export function KanbanBoard({ readOnly, onUnadopt, showUnadoptButton = false, boardMode = 'own', orgTestimonyBillIds, trackedBillIds, onTrackForSelf, onCardClick }: KanbanBoardProps) {
  const { searchQuery, setSearchQuery, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears, columnView, registerPhaseScroll } = useKanbanBoard();
  const { toast } = useToast();
  const { user, activeTenant } = useAuth();
  // Status changes are org-scoped; users with no org can't move cards.
  const isReadOnly = readOnly || !activeTenant;

  const {
    loadingBills: loading,
    bills,
    setBills,
    tempBills,
    proposeStatusChange,
    acceptTempChange,
    rejectTempChange,
    undoProposal,
  } = useBills();

  const [, setError] = useState<string | null>(null);
  const [draggingBillId, setDraggingBillId] = useState<string | null>(null);
  const { open: openBill } = useBillDialogParam();
  const filteredBills = useMemo<Bill[] | null>(
    () => (searchQuery.trim() ? searchBillsLocal(bills, searchQuery) : null),
    [bills, searchQuery]
  );
  // const [highlightedBillId, //setHighlightedBillId] = useState<string | null>(null);

  const activeColumns = columnView === 'simplified' ? SIMPLIFIED_COLUMNS : KANBAN_COLUMNS;
  const isSimplified = columnView === 'simplified';

  const introducedIdx = activeColumns.findIndex((col) =>
    col.id === (isSimplified ? 'simpleWaiting' : 'introduced')
  );
  const crossoverIdx = activeColumns.findIndex((col) =>
    col.id === (isSimplified ? 'simpleCrossoverWaiting' : 'crossoverWaiting1')
  );
  // The CONFERENCE column is `passedCommittees` (it opens the conference
  // phase); `conferenceAssigned` is the AWAITING COMMITTEES column after it.
  const conferenceIdx = activeColumns.findIndex((col) =>
    col.id === 'passedCommittees'
  );
  const governorIdx = activeColumns.findIndex((col) =>
    col.id === 'transmittedGovernor'
  );

  // =======================================================
  // ============= Scroll Handlers =========================
  // =======================================================
  
  // Phones (max-sm) show one centered column with a stub of each neighbour
  // peeking in: the viewports snap-x to column centers, and the column rows
  // carry px-5 (the peek gutter) so the first and last columns can center too.

  // Create refs for all columns dynamically
  const viewportRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  columnRefs.current.length = activeColumns.length;

  // Store refs to all bill cards across all columns
  const billCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const columnScrollViewportRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // ----- Mobile edge-hold auto-pan during drag -----
  // Columns are near full-viewport width on mobile, so the library's built-in
  // autoscroll barely triggers. We pan viewportRef.scrollLeft directly via rAF
  // while the drag pointer is held near the left/right edge. Mobile only.
  const EDGE_ZONE = 180; // px from edge that activates panning
  const MAX_PAN_PER_FRAME = 1; // px/frame at the very edge
  const MIN_PAN_PER_FRAME = 1; // px/frame floor when entering the zone
  const dragPointerXRef = useRef<number | null>(null);
  const autoPanRafRef = useRef<number | null>(null);
  const isMobileDragRef = useRef<boolean>(false);

  const autoPanTick = useCallback(() => {
    const viewport = viewportRef.current;
    const pointerX = dragPointerXRef.current;
    if (viewport && pointerX !== null) {
      const rect = viewport.getBoundingClientRect();
      const distFromLeft = pointerX - rect.left;
      const distFromRight = rect.right - pointerX;
      let velocity = 0;
      if (distFromLeft < EDGE_ZONE) {
        const intensity = (EDGE_ZONE - Math.max(distFromLeft, 0)) / EDGE_ZONE;
        velocity = -(MIN_PAN_PER_FRAME + (MAX_PAN_PER_FRAME - MIN_PAN_PER_FRAME) * intensity);
      } else if (distFromRight < EDGE_ZONE) {
        const intensity = (EDGE_ZONE - Math.max(distFromRight, 0)) / EDGE_ZONE;
        velocity = MIN_PAN_PER_FRAME + (MAX_PAN_PER_FRAME - MIN_PAN_PER_FRAME) * intensity;
      }
      if (velocity !== 0) {
        const maxScroll = viewport.scrollWidth - viewport.clientWidth;
        viewport.scrollLeft = Math.max(0, Math.min(maxScroll, viewport.scrollLeft + velocity));
      }
    }
    autoPanRafRef.current = requestAnimationFrame(autoPanTick);
  }, []);

  const handleDragPointerMove = useCallback((e: PointerEvent | TouchEvent) => {
    const clientX =
      'touches' in e
        ? e.touches[0]?.clientX ?? null
        : (e as PointerEvent).clientX;
    if (clientX !== null && clientX !== undefined) {
      dragPointerXRef.current = clientX;
    }
  }, []);

  const startAutoPan = useCallback(() => {
    if (typeof window === 'undefined') return;
    isMobileDragRef.current = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobileDragRef.current) return;
    dragPointerXRef.current = null;
    // Per-frame scrollLeft writes fight the inline scrollBehavior: 'smooth',
    // and snapping would yank each 1px nudge back to the nearest column.
    if (viewportRef.current) {
      viewportRef.current.style.scrollBehavior = 'auto';
      viewportRef.current.style.scrollSnapType = 'none';
    }
    window.addEventListener('pointermove', handleDragPointerMove, { passive: true });
    window.addEventListener('touchmove', handleDragPointerMove, { passive: true });
    if (autoPanRafRef.current === null) {
      autoPanRafRef.current = requestAnimationFrame(autoPanTick);
    }
  }, [handleDragPointerMove, autoPanTick]);

  const stopAutoPan = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointermove', handleDragPointerMove);
    window.removeEventListener('touchmove', handleDragPointerMove);
    if (autoPanRafRef.current !== null) {
      cancelAnimationFrame(autoPanRafRef.current);
      autoPanRafRef.current = null;
    }
    dragPointerXRef.current = null;
    isMobileDragRef.current = false;
    if (viewportRef.current) {
      viewportRef.current.style.scrollBehavior = 'smooth';
      viewportRef.current.style.scrollSnapType = ''; // back to the class's snap
    }
  }, [handleDragPointerMove]);

  // Tear down listeners/rAF if a drag is interrupted by unmount.
  useEffect(() => stopAutoPan, [stopAutoPan]);

  const scrollToIntroduced = () => scrollToColumnByIndex(introducedIdx);
  const scrollToCrossover = () => scrollToColumnByIndex(crossoverIdx);
  const scrollToConference = () => scrollToColumnByIndex(conferenceIdx);
  const scrollToGovernor = () => scrollToColumnByIndex(governorIdx);

  const handleScrollTo = (ref: React.RefObject<HTMLDivElement>) => {
    if (ref.current && viewportRef.current) {
      const container = viewportRef.current;
      const target = ref.current;

      const targetRect = target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // Phones center the column (its neighbours peek in on both sides, and
      // it's where the snap would settle anyway); wider screens show several
      // columns and keep the target flush left.
      const inset = window.matchMedia('(max-width: 639px)').matches
        ? Math.max(0, (containerRect.width - targetRect.width) / 2)
        : 0;
      // Explicit behavior — a bare scrollLeft assignment depends on the
      // viewport's inline scroll-behavior, which the drag auto-pan toggles
      // to 'auto' and may leave there.
      container.scrollTo({
        left: container.scrollLeft + (targetRect.left - containerRect.left) - inset,
        behavior: 'smooth',
      });
    }
  };

  const scrollToColumnByIndex = useCallback((columnIndex: number) => {
    if (columnIndex >= 0 && columnIndex < columnRefs.current.length) {
      const element = columnRefs.current[columnIndex];
      if (element) {
        const ref = { current: element };
        handleScrollTo(ref);
      }
    } else {
      console.warn('Invalid column index:', columnIndex);
    }
  }, []);

  // The phone phase pills render in KanbanHeader (beside Filters); hand them
  // this board's scroller. Re-registered when the column set changes.
  useEffect(() => {
    const phaseIdx = { introduced: introducedIdx, crossover: crossoverIdx, conference: conferenceIdx, governor: governorIdx };
    registerPhaseScroll((phase) => scrollToColumnByIndex(phaseIdx[phase]));
    return () => registerPhaseScroll(null);
  }, [registerPhaseScroll, scrollToColumnByIndex, introducedIdx, crossoverIdx, conferenceIdx, governorIdx]);

  // ----- Phone page dots -----
  // Which column sits nearest the viewport's center, for the dot indicator.
  // Measured at most once per frame while scrolling.
  const [activeColumnIdx, setActiveColumnIdx] = useState(0);
  const scrollRafRef = useRef<number | null>(null);
  const handleViewportScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const viewport = viewportRef.current;
      if (!viewport) return;
      const vr = viewport.getBoundingClientRect();
      const center = vr.left + vr.width / 2;
      let best = 0;
      let bestDist = Infinity;
      columnRefs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dist = Math.abs(r.left + r.width / 2 - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActiveColumnIdx((prev) => (prev === best ? prev : best));
    });
  }, []);
  useEffect(() => () => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      // Clear the pending flag too: Strict Mode runs this cleanup between its
      // double-mounted effects, and a stale id here made every later scroll
      // think a measure was already queued — freezing the dots on column 1.
      scrollRafRef.current = null;
    }
  }, []);
  // A new column set (simplified <-> detailed) or the first real render after
  // loading moves things without a scroll event, so re-measure then too.
  useEffect(() => {
    if (!loading) handleViewportScroll();
  }, [loading, activeColumns, handleViewportScroll]);

  // =======================================================
  // ==================== Effects ==========================
  // =======================================================

  // Navigate to first search result
  useEffect(() => {
    if (!searchQuery.trim() || !filteredBills || filteredBills.length === 0) {
      //setHighlightedBillId(null);
      return;
    }

    const firstBill = filteredBills[0];
    if (!firstBill) return;

    // Find which column this bill is in
    const billStatus = firstBill.current_bill_status as BillStatus;
    let columnIndex: number;
    if (isSimplified) {
      const simplifiedId = STATUS_TO_SIMPLIFIED[billStatus] ?? billStatus;
      columnIndex = activeColumns.findIndex(col => col.id === simplifiedId);
    } else {
      columnIndex = activeColumns.findIndex(col => col.id === billStatus);
    }

    if (columnIndex >= 0) {
      // Scroll to the column containing the first match
      scrollToColumnByIndex(columnIndex);

      // Highlight the first matched bill
      //setHighlightedBillId(firstBill.id);

      // Clear highlight after 3 seconds
      const highlightTimeout = setTimeout(() => {
        //setHighlightedBillId(null);
      }, 3000);

      return () => clearTimeout(highlightTimeout);
    }
  }, [filteredBills, searchQuery, scrollToColumnByIndex, isSimplified, activeColumns]);

  // =======================================================
  // ==================== Bill Rendering ===================
  // =======================================================

  const billsByColumn = useMemo(() => {
    const grouped = Object.fromEntries(
      activeColumns.map(c => [c.id, [] as Bill[]])
    ) as Record<string, Bill[]>;

    // Search already ran in the filteredBills memo; apply the remaining
    // narrowing through the shared predicate (src/lib/bill-filters.ts).
    const base = (searchQuery.trim() && filteredBills) ? filteredBills : bills;
    // Another org's board: ignore selected tags from your own org (see tagIdsOnBoard).
    const tagIds = boardMode === 'active-boards' ? tagIdsOnBoard(selectedTagIds, bills) : selectedTagIds;
    const items = filterBills(base, { searchQuery: '', selectedTagIds: tagIds, selectedYears, deadFilter: 'all' });

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

    // Sort each column's bills: alive bills first, dead ones sink to the bottom;
    // within each group, most recent status update first.
    Object.keys(grouped).forEach((status) => {
      grouped[status].sort((a, b) => {
        // Primary: alive (dead === false) above dead.
        if (a.dead !== b.dead) return Number(a.dead) - Number(b.dead);

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
  }, [bills, filteredBills, searchQuery, selectedTagIds, selectedYears, activeColumns, isSimplified, boardMode]);

  const billsToGroup: Bill[] = searchQuery.trim() && filteredBills ? filteredBills : bills;

  // For quick lookups when filtering temp bills to match search results
  const visibleBillIds = useMemo(() => new Set(billsToGroup.map((b) => b.id)), [billsToGroup]);

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

  // =======================================================
  // ==================== Drag and Drop ====================
  // =======================================================

  const onDragStart = useCallback((start: any) => {
    setDraggingBillId(start.draggableId);
    startAutoPan();
  }, [startAutoPan]);

  const onDragEnd = useCallback(
    async (result: DropResult) => {
      stopAutoPan();
      if (isReadOnly) return;

      setDraggingBillId(null);
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (destination.droppableId === source.droppableId && destination.index === source.index) return;

      const sourceColumnId = source.droppableId as BillStatus;
      const destinationColumnId = destination.droppableId as BillStatus;
      const movedBill = bills.find((b) => b.id === draggableId);
      if (!movedBill) return;

      // Workers propose changes (no direct commit)
      if (activeTenant?.orgRole === 'worker') {
        await proposeStatusChange(movedBill, destinationColumnId, {
          userId: user!.id,
          role: 'worker',
        });
        toast({
          title: 'Change proposed',
          description: `Awaiting supervisor approval.`,
        });
        return;
      }

      // Optimistic commit for supervisors/admins
      const newBills = Array.from(bills);
      const billIndex = newBills.findIndex((b) => b.id === draggableId);

      if (billIndex > -1) {
        const updatedBill = {
          ...newBills[billIndex],
          current_bill_status: destinationColumnId,
          llm_suggested: false,
        };
        newBills.splice(billIndex, 1, updatedBill);
        setBills(newBills);
      } else {
        console.error('Bill not found for optimistic update');
        return;
      }

      try {
        await dataClient.bills.updateStatus({
          billId: draggableId,
          newStatus: destinationColumnId,
          tenantId: activeTenant?.tenantId,
        });
        toast({
          title: 'Bill Status Updated',
          description: `${movedBill.bill_title} moved to ${COLUMN_TITLES[destinationColumnId]}.`,
        });
      } catch (error) {
        console.error('Failed to update bill status:', error);
        setError('Failed to update bill status. Please try again.');
        // Revert optimistic update on error
        const revertedBills = Array.from(bills);
        const billToRevertIndex = revertedBills.findIndex((b) => b.id === draggableId);
        if (billToRevertIndex > -1) {
          const revertedBill = {
            ...revertedBills[billToRevertIndex],
            current_bill_status: sourceColumnId,
          };
          revertedBills.splice(billToRevertIndex, 1, revertedBill);
          setBills(revertedBills);
        }
        toast({
          title: 'Update Failed',
          description: `Could not move ${movedBill.bill_title}. Please try again.`,
          variant: 'destructive',
        });
      }
    },
    [bills, isReadOnly, user, activeTenant, proposeStatusChange, toast, setBills, stopAutoPan]
  );

  // ===========================================================
  // ==================== Card Click Handler ===================
  // ===========================================================

  const handleCardClick = useCallback((bill: Bill) => {
    if (onCardClick) onCardClick(bill);
    else openBill(bill.id);
  }, [onCardClick, openBill]);

  // Center a card vertically in its column's own scroll area. Waits a beat so
  // the horizontal scroll to that column (smooth) has landed first.
  const scrollCardIntoColumn = useCallback((billId: string, columnIndex: number) => {
    setTimeout(() => {
      const billElement = billCardRefs.current.get(billId);
      const viewport = columnScrollViewportRefs.current.get(columnIndex);
      if (!billElement || !viewport) return;
      const billRect = billElement.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      viewport.scrollTo({
        top: viewport.scrollTop + (billRect.top - viewportRect.top) - viewportRect.height / 2 + billRect.height / 2,
        behavior: 'smooth',
      });
    }, 300);
  }, []);

  const handleTempCardClick = useCallback(
    (tempBill: TempBill) => {
      // Find the column index where the real bill currently is (current_status)
      let targetId: string;
      if (isSimplified) {
        targetId = STATUS_TO_SIMPLIFIED[tempBill.proposed_status] ?? tempBill.proposed_status;
      } else {
        targetId = tempBill.proposed_status;
      }
      const currentStatusColumnIndex = activeColumns.findIndex(
        col => col.id === targetId
      );

      // Scroll horizontally to the column where the real bill is, then
      // vertically to its card within that column.
      if (currentStatusColumnIndex !== -1) {
        scrollToColumnByIndex(currentStatusColumnIndex);
      }
      scrollCardIntoColumn(tempBill.id, currentStatusColumnIndex);
    },
    [scrollToColumnByIndex, scrollCardIntoColumn, isSimplified, activeColumns]
  );

  // ----- ?focus=<billId>: "View on board" from a track toast -----
  // Find the bill in the columns as rendered (so view mode, fallbacks and
  // filters all agree), bring it into view, ring it briefly, then drop the
  // param so a reload doesn't replay it.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const focusBillId = searchParams.get('focus');
  const [highlightedBillId, setHighlightedBillId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusBillId || loading) return;
    const dropParam = () => {
      const rest = new URLSearchParams(searchParams.toString());
      rest.delete('focus');
      const qs = rest.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
    const columnIndex = activeColumns.findIndex((c) =>
      billsByColumn[c.id]?.some((b) => b.id === focusBillId),
    );
    if (columnIndex === -1) {
      // On the board but hidden by the search/tag/year filters: clear them so
      // the bill can show (this effect re-runs on the new columns), and say so.
      // A just-tracked bill is never archived, and the failed/active filter only
      // applies to the spreadsheet, so these three are what can hide it.
      // Only when a filter is actually on — resetting already-empty filters
      // would hand out fresh [] refs, re-run this effect, and loop.
      const filtersActive = searchQuery.trim() !== '' || selectedTagIds.length > 0 || selectedYears.length > 0;
      if (filtersActive && bills.some((b) => b.id === focusBillId)) {
        setSearchQuery('');
        setSelectedTagIds([]);
        setSelectedYears([]);
        toast({ title: 'Board filters cleared', description: 'So the bill you tracked is visible.' });
        return;
      }
      // Not loaded yet (the board refetches after a track). If it never
      // arrives, give up quietly so the param doesn't linger.
      const giveUp = setTimeout(dropParam, 4000);
      return () => clearTimeout(giveUp);
    }
    scrollToColumnByIndex(columnIndex);
    scrollCardIntoColumn(focusBillId, columnIndex);
    setHighlightedBillId(focusBillId);
    dropParam();
    // searchParams/router/pathname only feed dropParam; re-running on their
    // churn would re-scroll after the param is already gone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBillId, loading, billsByColumn, bills, searchQuery, selectedTagIds, selectedYears, activeColumns, scrollToColumnByIndex, scrollCardIntoColumn]);

  // The highlight clears once its three pulses (3 × 1.6s) have played.
  useEffect(() => {
    if (!highlightedBillId) return;
    const t = setTimeout(() => setHighlightedBillId(null), 5000);
    return () => clearTimeout(t);
  }, [highlightedBillId]);

  return (
    <>
      {(isReadOnly || isSimplified) ? (
        <ScrollAreaPrimitive.Root className="relative min-h-0 w-full flex-1 overflow-hidden p-2 md:p-4">
          <ScrollAreaPrimitive.Viewport
            ref={viewportRef}
            onScroll={handleViewportScroll}
            className="h-full w-full max-w-[100vw] rounded-[inherit] max-sm:snap-x max-sm:snap-mandatory max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden [&>div]:!flex [&>div]:h-full"
            style={{ scrollBehavior: 'smooth' }}
          >
            {loading ? (
              <KanbanBoardSkeleton columns={activeColumns.length} />
            ) : (
              <div className="flex h-full space-x-2 md:space-x-4 pb-4 max-sm:px-5">
                {activeColumns.map((column, idx) => (
                  <div
                    key={column.id}
                    ref={(el) => {
                      columnRefs.current[idx] = el;
                    }}
                    className={cn('h-full shrink-0 max-sm:snap-center', RISE_IN)}
                    style={riseDelay(idx)}
                  >
                    <KanbanColumn
                      columnId={column.id as BillStatus}
                      title={column.title}
                      bills={billsByColumn[column.id] || []}
                      isDraggingOver={false}
                      draggingBillId={null}
                      onCardClick={handleCardClick}
                      onUnadopt={onUnadopt}
                      showUnadoptButton={showUnadoptButton}
                      readOnly={true}
                      enableDnd={false}

                      pendingTempBills={tempBillsByColumn[column.id] || []}
                      canModerate={activeTenant?.orgRole === 'admin'}
                      onApproveTemp={(billId) => acceptTempChange(billId)}
                      onRejectTemp={(billId) => rejectTempChange(billId)}
                      onUndoProposal={(billId) => undoProposal(billId)}
                      onTempCardClick={handleTempCardClick}
                      billCardRefs={billCardRefs}
                      columnScrollViewportRefs={columnScrollViewportRefs}
                      columnIndex={idx}
                      boardMode={boardMode}
                      orgTestimonyBillIds={orgTestimonyBillIds}
                      trackedBillIds={trackedBillIds}
                      onTrackForSelf={onTrackForSelf}
                      highlightedBillId={highlightedBillId}
                    />
                  </div>
                ))}
              </div>
            )}
          </ScrollAreaPrimitive.Viewport>
          {/* Phones swipe and follow the page dots instead of a scrollbar. */}
          <ScrollBar orientation="horizontal" className="max-sm:hidden" />
        </ScrollAreaPrimitive.Root>
      ) : (
        <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <ScrollAreaPrimitive.Root className="relative min-h-0 w-full flex-1 overflow-hidden p-2 md:p-4">
            <ScrollAreaPrimitive.Viewport
              ref={viewportRef}
              onScroll={handleViewportScroll}
              className="h-full w-full max-w-[100vw] rounded-[inherit] max-sm:snap-x max-sm:snap-mandatory max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden [&>div]:!flex [&>div]:h-full"
              style={{ scrollBehavior: 'smooth' }}
            >
              {loading ? (
                <KanbanBoardSkeleton columns={activeColumns.length} />
              ) : (
                <div className="flex h-full space-x-2 md:space-x-4 pb-4 max-sm:px-5">
                  {activeColumns.map((column, idx) => (
                    <div
                      key={column.id}
                      ref={(el) => {
                        columnRefs.current[idx] = el;
                      }}
                      // Columns rise in as whole units rather than per card: the
                      // cards are Draggables whose own transform dnd controls, and
                      // a dropped card remounts in its new column, which would
                      // replay a per-card animation on every move.
                      className={cn('h-full shrink-0 max-sm:snap-center', RISE_IN)}
                      style={riseDelay(idx)}
                    >
                      <Droppable droppableId={column.id}>
                        {(provided, snapshot) => (
                          <KanbanColumn
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            columnId={column.id as BillStatus}
                            title={column.title}
                            bills={billsByColumn[column.id] || []}
                            isDraggingOver={snapshot.isDraggingOver}
                            draggingBillId={draggingBillId}
                            onCardClick={handleCardClick}
                            onUnadopt={onUnadopt}
                            showUnadoptButton={showUnadoptButton}
                            readOnly={false}
                            enableDnd={true}
                            /* pending proposals */
                            pendingTempBills={tempBillsByColumn[column.id] || []}
                            canModerate={activeTenant?.orgRole === 'admin'}
                            onApproveTemp={(billId) => acceptTempChange(billId)}
                            onRejectTemp={(billId) => rejectTempChange(billId)}
                            onUndoProposal={(billId) => undoProposal(billId)}
                            onTempCardClick={handleTempCardClick}
                            billCardRefs={billCardRefs}
                            columnScrollViewportRefs={columnScrollViewportRefs}
                            columnIndex={idx}
                            boardMode={boardMode}
                            orgTestimonyBillIds={orgTestimonyBillIds}
                            trackedBillIds={trackedBillIds}
                            onTrackForSelf={onTrackForSelf}
                            highlightedBillId={highlightedBillId}
                          >
                            {provided.placeholder}
                          </KanbanColumn>
                        )}
                      </Droppable>
                    </div>
                  ))}
                </div>
              )}
            </ScrollAreaPrimitive.Viewport>
            {/* Phones swipe and follow the page dots instead of a scrollbar. */}
            <ScrollBar orientation="horizontal" className="max-sm:hidden" />
          </ScrollAreaPrimitive.Root>
        </DragDropContext>
      )}

      {/* Phone page dots: one per column, the centered one filled and widened,
          so it's clear more columns sit off-screen and where you are among
          them. Decorative — the columns themselves are the navigation. */}
      {!loading && activeColumns.length > 1 && (
        <div className="flex shrink-0 justify-center gap-1.5 py-2 sm:hidden" aria-hidden="true">
          {activeColumns.map((column, idx) => (
            <span
              key={column.id}
              className={cn(
                'h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none',
                idx === activeColumnIdx ? 'w-4 bg-primary' : 'w-1.5 bg-foreground/20',
              )}
            />
          ))}
        </div>
      )}

      {/* Bottom scroll bar */}
      <div className="hidden md:flex w-full shrink-0 justify-center gap-4 bg-background/90 p-2 z-20 border-t">
        <Button variant="secondary" onClick={scrollToIntroduced}>
          Introduced
        </Button>
        <Button variant="secondary" onClick={scrollToCrossover}>
          Crossover
        </Button>
        <Button variant="secondary" onClick={scrollToConference}>
          Conference
        </Button>
        <Button variant="secondary" onClick={scrollToGovernor}>
          Governor
        </Button>
      </div>

      {/* Details dialog */}
      <UrlBillDetailsDialog
        boardMode={boardMode}
        allowBoardRemoval
      />
    </>
  );
}
