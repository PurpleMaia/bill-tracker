'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Bill, BillStatus, TempBill } from '@/types/legislation';
import { KANBAN_COLUMNS, COLUMN_TITLES } from '@/lib/kanban-columns';
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

const introducedIdx = KANBAN_COLUMNS.findIndex((col) => col.id === 'introduced');
const crossoverIdx = KANBAN_COLUMNS.findIndex((col) => col.id === 'crossoverWaiting1');
const conferenceIdx = KANBAN_COLUMNS.findIndex((col) => col.id === 'conferenceAssigned');
const governorIdx = KANBAN_COLUMNS.findIndex((col) => col.id === 'transmittedGovernor');

interface KanbanBoardProps {
  readOnly: boolean;
  onUnadopt?: (billId: string) => void;
  showUnadoptButton?: boolean;
}

export function KanbanBoard({ readOnly, onUnadopt, showUnadoptButton = false }: KanbanBoardProps) {
  const { searchQuery, selectedTagIds, selectedYears } = useKanbanBoard();
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

  // =======================================================
  // ============= Scroll Handlers =========================
  // =======================================================
  
  // Create refs for all columns dynamically
  const viewportRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>(
    new Array(KANBAN_COLUMNS.length).fill(null)
  );

  // Store refs to all bill cards across all columns
  const billCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const columnScrollViewportRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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
    const columnIndex = KANBAN_COLUMNS.findIndex(col => col.id === billStatus);
    
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
  }, [filteredBills, searchQuery, scrollToColumnByIndex]);

  // =======================================================
  // ==================== Bill Rendering ===================
  // =======================================================

  const billsByColumn = useMemo(() => {
    const grouped = Object.fromEntries(
      KANBAN_COLUMNS.map(c => [c.id as BillStatus, [] as Bill[]])
    ) as Record<BillStatus, Bill[]>;

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
        // Convert to number to handle potential string/number mismatches
        const normalizedBillYear = typeof billYear === 'string' ? parseInt(billYear, 10) : billYear;
        return selectedYears.includes(normalizedBillYear);
      });
    }

    const fallbackId = (KANBAN_COLUMNS.find(c => c.id === 'unassigned')?.id
                     ?? KANBAN_COLUMNS[0].id) as BillStatus;

    // Group bills into columns
    for (const bill of items) {
      const valid = KANBAN_COLUMNS.some(c => c.id === bill.current_bill_status);
      const key = (valid ? bill.current_bill_status : fallbackId) as BillStatus;
      grouped[key].push(bill);
    }

    // Sort each column's bills by latest status update date (most recent first)
    Object.keys(grouped).forEach((status) => {
      grouped[status as BillStatus].sort((a, b) => {
        // Get the latest update date from Bill's latest_update field
        const getLatestUpdateDate = (bill: Bill): number => {
          if (bill.latest_update && bill.latest_update.date) {
            const date = new Date(bill.latest_update.date);
            return date.getTime();
          }
          
          return 0; // Put bills without dates at the end
        };

        const dateA = getLatestUpdateDate(a);
        const dateB = getLatestUpdateDate(b);
        return dateB - dateA; // Descending order (newest first)
      });
    });

    return grouped;
  }, [bills, filteredBills, searchQuery, selectedTagIds, selectedYears]);

  const billsToGroup: Bill[] = searchQuery.trim() && filteredBills ? filteredBills : bills;

  // For quick lookups when filtering temp bills to match search results
  const visibleBillIds = useMemo(() => new Set(billsToGroup.map((b) => b.id)), [billsToGroup]);

  const tempBillsByColumn = useMemo(() => {
    const grouped: { [key in BillStatus]?: TempBill[] } = {};
    KANBAN_COLUMNS.forEach((c) => (grouped[c.id as BillStatus] = []));

    tempBills.forEach((tb) => {
      if (searchQuery.trim() && !visibleBillIds.has(tb.id)) {
        return;
      }
      // Group by current_status so temp bill appears in the original column
      const key = tb.current_status as BillStatus;
      grouped[key]?.push(tb);
    });

    return grouped;
  }, [tempBills, searchQuery, visibleBillIds]);

  // =======================================================
  // ==================== Drag and Drop ====================
  // =======================================================

  const onDragStart = useCallback((start: any) => {
    setDraggingBillId(start.draggableId);
  }, []);

  const onDragEnd = useCallback(
    async (result: DropResult) => {
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
            current_status: sourceColumnId,
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
    [bills, readOnly, user, activeTenant, proposeStatusChange, toast, filteredBills, searchQuery, setBills]
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
      const currentStatusColumnIndex = KANBAN_COLUMNS.findIndex(
        col => col.id === tempBill.proposed_status
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
    [scrollToColumnByIndex]
  );

  return (
    <>
      {readOnly ? (
        <ScrollArea className="h-full w-full whitespace-nowrap p-4">
          <ScrollAreaPrimitive.Viewport
            ref={viewportRef}
            className="h-full w-full max-w-[100vw] rounded-[inherit]"
            style={{ scrollBehavior: 'smooth' }}
          >
            {loading ? (
              <KanbanBoardSkeleton />
            ) : (
              <div className="flex space-x-4 pb-4">
                {KANBAN_COLUMNS.map((column, idx) => (
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
                      bills={billsByColumn[column.id as BillStatus] || []}
                      isDraggingOver={false}
                      draggingBillId={null}
                      onCardClick={handleCardClick}
                      onUnadopt={onUnadopt}
                      showUnadoptButton={showUnadoptButton}
                      readOnly={true}
                      enableDnd={false}

                      pendingTempBills={tempBillsByColumn[column.id as BillStatus] || []}
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
          <ScrollArea className="h-full w-full whitespace-nowrap p-4">
            <ScrollAreaPrimitive.Viewport
              ref={viewportRef}
              className="h-full w-full max-w-[100vw] rounded-[inherit]"
              style={{ scrollBehavior: 'smooth' }}
            >
              {loading ? (
                <KanbanBoardSkeleton />
              ) : (
                <div className="flex space-x-4 pb-4">
                  {KANBAN_COLUMNS.map((column, idx) => (
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
                            bills={billsByColumn[column.id as BillStatus] || []}
                            isDraggingOver={snapshot.isDraggingOver}
                            draggingBillId={draggingBillId}
                            onCardClick={handleCardClick}
                            onUnadopt={onUnadopt}
                            showUnadoptButton={showUnadoptButton}
                            readOnly={false}
                            enableDnd={true}
                            /* pending proposals */
                            pendingTempBills={tempBillsByColumn[column.id as BillStatus] || []}
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
      <div className="fixed bottom-0 left-0 w-full flex justify-center gap-4 bg-background/90 p-2 z-20 border-t">
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
