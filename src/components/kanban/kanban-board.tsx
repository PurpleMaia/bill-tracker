'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Bill, BillStatus, TempBill } from '@/types/legislation';
import { KANBAN_COLUMNS, COLUMN_TITLES, SIMPLIFIED_COLUMNS, STATUS_TO_SIMPLIFIED } from '@/lib/kanban-columns';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { searchBills } from '@/services/data/legislation';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useToast } from '@/hooks/use-toast';
import { BillDetailsDialog } from './bill-details-dialog';
import { Button } from '@/components/ui/button';
import { useBills } from '@/hooks/contexts/bills-context';
import KanbanBoardSkeleton from './skeletons/skeleton-board';
import { KanbanColumn } from './kanban-column';
import { useAuth } from '@/hooks/contexts/auth-context';
import { KanbanPillStrip } from './kanban-pill-strip';


interface KanbanBoardProps {
  readOnly: boolean;
  onUnadopt?: (billId: string) => void;
  showUnadoptButton?: boolean;
}

export function KanbanBoard({ readOnly, onUnadopt, showUnadoptButton = false }: KanbanBoardProps) {
  const { searchQuery, selectedTagIds, selectedYears, columnView } = useKanbanBoard();
  const { toast } = useToast();
  const { user, activeTenant } = useAuth();

  const {
    loadingBills: loading,
    setLoadingBills: setLoading,
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
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [filteredBills, setFilteredBills] = useState<Bill[] | null>();
  // const [highlightedBillId, //setHighlightedBillId] = useState<string | null>(null);

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

  // =======================================================
  // ============= Scroll Handlers =========================
  // =======================================================
  
  // Create refs for all columns dynamically
  const viewportRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  columnRefs.current.length = activeColumns.length;

  // Store refs to all bill cards across all columns
  const billCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const columnScrollViewportRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // ----- Mobile edge-hold auto-pan during drag -----
  // Columns are 85vw on mobile, so the library's built-in autoscroll barely
  // triggers. We pan viewportRef.scrollLeft directly via rAF while the drag
  // pointer is held near the left/right edge. Mobile only.
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
    // Per-frame scrollLeft writes fight the inline scrollBehavior: 'smooth'.
    if (viewportRef.current) viewportRef.current.style.scrollBehavior = 'auto';
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
    if (viewportRef.current) viewportRef.current.style.scrollBehavior = 'smooth';
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
      const scrollLeft = container.scrollLeft + (targetRect.left - containerRect.left);
      container.scrollLeft = scrollLeft;
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

  // =======================================================
  // ==================== Effects ==========================
  // =======================================================

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredBills(null);
      //setHighlightedBillId(null);
      return;
    }

    setError(null);
    const handler = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchBills(bills, searchQuery);
        setFilteredBills(results);
      } catch (err) {
        console.error('Error searching bills:', err);
        setError('Failed to search bills.');
        setFilteredBills(null);
        //setHighlightedBillId(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery, setLoading, bills]);

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
      if (readOnly) return;

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

        if (filteredBills && searchQuery.trim()) {
          const newFilteredBills = Array.from(filteredBills);
          const filteredBillIndex = newFilteredBills.findIndex((b) => b.id === draggableId);
          if (filteredBillIndex > -1) {
            newFilteredBills.splice(filteredBillIndex, 1, updatedBill);
            setFilteredBills(newFilteredBills);
          }
        }
      } else {
        console.error('Bill not found for optimistic update');
        return;
      }

      try {
        const response = await fetch(`/api/bills/${draggableId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'updateStatus',
            newStatus: destinationColumnId,
            tenantId: activeTenant?.tenantId,
          }),
        });
        if (!response.ok) throw new Error('Failed to update bill status on server.');
        const data = await response.json();
        const updatedBillFromServer = data.bill;
        if (!updatedBillFromServer) {
          throw new Error('Failed to update bill status on server.');
        }
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
    [bills, readOnly, user, activeTenant, proposeStatusChange, toast, filteredBills, searchQuery, setBills, stopAutoPan]
  );

  // ===========================================================
  // ==================== Card Click Handler ===================
  // ===========================================================

  const handleCardClick = useCallback((bill: Bill) => {
    setSelectedBillId(bill.id);
    setIsDialogOpen(true);
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

      // First, scroll horizontally to the column where the real bill is
      if (currentStatusColumnIndex !== -1) {
        scrollToColumnByIndex(currentStatusColumnIndex);
      }

      // Then, scroll vertically to the bill card within that column
      // Wait a bit for the horizontal scroll to complete
      setTimeout(() => {
        const billElement = billCardRefs.current.get(tempBill.id);
        const viewport = columnScrollViewportRefs.current.get(currentStatusColumnIndex);

        if (billElement && viewport) {
          // Get the position of the bill card relative to the viewport
          const billRect = billElement.getBoundingClientRect();
          const viewportRect = viewport.getBoundingClientRect();

          // Calculate the scroll position to center the bill card
          const scrollTop = viewport.scrollTop + (billRect.top - viewportRect.top) - (viewportRect.height / 2) + (billRect.height / 2);

          // Smooth scroll to the position
          viewport.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
          });
        }
      }, 300); // Wait for horizontal scroll animation
    },
    [scrollToColumnByIndex, isSimplified, activeColumns]
  );

  return (
    <>
      <KanbanPillStrip
        onScrollToIntroduced={scrollToIntroduced}
        onScrollToCrossover={scrollToCrossover}
        onScrollToConference={scrollToConference}
        onScrollToGovernor={scrollToGovernor}
      />

      {(readOnly || isSimplified) ? (
        <ScrollArea className="h-full w-full whitespace-nowrap p-2 md:p-4">
          <ScrollAreaPrimitive.Viewport
            ref={viewportRef}
            className="h-full w-full max-w-[100vw] rounded-[inherit]"
            style={{ scrollBehavior: 'smooth' }}
          >
            {loading ? (
              <KanbanBoardSkeleton />
            ) : (
              <div className="flex space-x-2 md:space-x-4 pb-4">
                {activeColumns.map((column, idx) => (
                  <div
                    key={column.id}
                    ref={(el) => {
                      columnRefs.current[idx] = el;
                    }}
                    className="inline-block"
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
                    />
                  </div>
                ))}
              </div>
            )}
          </ScrollAreaPrimitive.Viewport>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : (
        <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <ScrollArea className="h-full w-full whitespace-nowrap p-2 md:p-4">
            <ScrollAreaPrimitive.Viewport
              ref={viewportRef}
              className="h-full w-full max-w-[100vw] rounded-[inherit]"
              style={{ scrollBehavior: 'smooth' }}
            >
              {loading ? (
                <KanbanBoardSkeleton />
              ) : (
                <div className="flex space-x-2 md:space-x-4 pb-4">
                  {activeColumns.map((column, idx) => (
                    <div
                      key={column.id}
                      ref={(el) => {
                        columnRefs.current[idx] = el;
                      }}
                      className="inline-block"
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
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </DragDropContext>
      )}

      {/* Bottom scroll bar */}
      <div className="hidden md:flex fixed bottom-0 left-0 w-full justify-center gap-4 bg-background/90 p-2 z-20 border-t">
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
      <BillDetailsDialog
        billID={selectedBillId}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  );
}
