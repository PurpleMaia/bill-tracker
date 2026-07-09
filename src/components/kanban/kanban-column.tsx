

'use client';

import React, { useRef, useState } from 'react';
import type { Bill, TempBill } from '@/types/legislation';
import { KanbanCard } from './kanban-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Draggable } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { TempBillCard } from './temp-card';
import { HelpCircle, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COLUMN_DESCRIPTIONS } from '@/lib/kanban-columns';
import ColumnOptionsMenu from './column-options-menu';
import { useAuth } from '@/hooks/contexts/auth-context';

// Adds readOnly prop to control card rendering
// When readOnly=true, cards aren't wrapped in Draggable components

/** Map a column ID to its legislative-phase background class. */
function getColumnPhaseBg(columnId: string): string {
  if (columnId === 'vetoList') return 'bg-[#f8d7d2]';
  if (columnId === 'governorSigns' || columnId === 'lawWithoutSignature') return 'bg-[#d6e8d4]';
  // Waiting columns (introduced, waiting, crossover waiting) get olive
  if (columnId === 'introduced' || columnId === 'simpleWaiting' || columnId.startsWith('crossoverWaiting') || columnId === 'simpleCrossoverWaiting')
    return 'bg-olive-soft';
  // Passed committees and transmitted to governor get olive
  if (columnId === 'passedCommittees' || columnId === 'transmittedGovernor')
    return 'bg-olive-soft';
  return 'bg-secondary/50';
}

export interface KanbanColumnProps extends React.HTMLAttributes<HTMLDivElement> {
  columnId: any; // keep as-is since your board passes a string id
  title: string;
  bills: Bill[];
  isDraggingOver: boolean;
  draggingBillId: string | null;
  children?: React.ReactNode; // Droppable placeholder
  onCardClick: (bill: Bill) => void;
  readOnly?: boolean;
  onUnadopt?: (billId: string) => void;
  showUnadoptButton?: boolean;

  // NEW — pending proposals support
  pendingTempBills?: TempBill[];
  canModerate?: boolean; // show Approve/Reject for supervisors/admins
  onApproveTemp?: (billId: string) => void;
  onRejectTemp?: (billId: string) => void;
  onUndoProposal?: (billId: string) => void;
  onTempCardClick?: (tempBill: TempBill) => void; // Handler for temp card clicks
  billCardRefs?: React.MutableRefObject<Map<string, HTMLDivElement>>; // Shared refs for all bill cards
  columnScrollViewportRefs?: React.MutableRefObject<Map<number, HTMLDivElement>>; // Shared refs for all column scroll viewports
  columnIndex?: number; // Index of this column in the board

  enableDnd?: boolean;

  boardMode?: import('@/lib/board-display').BoardMode;
  orgTestimonyBillIds?: Set<string>;
  trackedBillIds?: Set<string>;
  onTrackForSelf?: (bill: Bill) => void;
}


export const KanbanColumn = React.forwardRef<HTMLDivElement, KanbanColumnProps>(
  (
    {
      columnId,
      title,
      bills,
      isDraggingOver,
      draggingBillId,
      onCardClick,
      onUnadopt,
      showUnadoptButton = false,
      children,
      className,
      readOnly = false,

      pendingTempBills = [],
      canModerate = false,
      onApproveTemp,
      onRejectTemp,
      onUndoProposal,
      onTempCardClick,
      billCardRefs: sharedBillCardRefs,
      columnScrollViewportRefs,
      columnIndex,

      enableDnd = false,

      boardMode = 'own',
      orgTestimonyBillIds,
      trackedBillIds,
      onTrackForSelf,
      ...props
    },
    ref
  ) => {
    const { activeTenant } = useAuth();
    const [refreshing, setRefreshing] = useState(false);

    // Use shared refs from parent, or create local ones if not provided
    const localBillCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    const billCardRefsToUse = sharedBillCardRefs || localBillCardRefs;

    const pendingCount = pendingTempBills?.length ?? 0;

    return (
      <div
        ref={ref}
        className={cn(
          // Column width = (viewport − board padding − gaps) / N so an exact
          // number of columns is visible per breakpoint: 1 phone, 2 sm/md,
          // 3 lg (small laptop), 4 xl (laptop), 5 2xl (desktop).
          'flex h-full shrink-0 flex-col rounded-lg',
          'w-[calc(100vw-1rem)] sm:w-[calc((100vw-1.5rem)/2)] md:w-[calc((100vw-3rem)/2)]',
          'lg:w-[calc((100vw-4rem)/3)] xl:w-[calc((100vw-5rem)/4)] 2xl:w-[calc((100vw-6rem)/5)]',
          getColumnPhaseBg(columnId),
          isDraggingOver ? 'bg-accent/20' : '',
          className
        )}
        {...props}
      >
        {/* Header — sits above the column's own scroll area, so no sticky/blur needed */}
        <div className="rounded-t-lg p-3">
          <h2
            className="flex items-center justify-between gap-2 text-sm font-semibold text-secondary-foreground"
            title={title}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-wrap max-w-[12rem] md:max-w-[16rem]">
                {title}
              </span>
              <span className="shrink-0 text-muted-foreground">({bills.length})</span>
              {pendingCount > 0 && (
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border">
                  Pending {pendingCount}
                </span>
              )}
            </span>

            <span className="flex shrink-0 items-center gap-1">
              {refreshing && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Updating column" />
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="shrink-0 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={`What does "${title}" mean?`}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <h3 className="text-sm font-semibold mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {COLUMN_DESCRIPTIONS[columnId] ?? 'No description available for this stage.'}
                  </p>
                </PopoverContent>
              </Popover>
              {/* Scraper/LLM column actions are org workflows — org members only,
                  and meaningless on another org's read-only Active Board. */}
              {activeTenant && boardMode !== 'active-boards' && (
                <ColumnOptionsMenu
                  bills={bills}
                  onRefreshStart={() => setRefreshing(true)}
                  onRefreshEnd={() => setRefreshing(false)}
                />
              )}
            </span>
          </h2>
        </div>

        {/* Radix wraps viewport content in an inline-styled `display: table` div,
            which refuses to shrink below nowrap text (e.g. truncated status lines)
            and pushes cards past the column edge. Force it to block — this scroll
            area is vertical-only, so table shrink-wrap sizing isn't needed. */}
        <ScrollArea className="flex-1 p-2 [&_[data-radix-scroll-area-viewport]>div]:!block">
          <div
            className="flex flex-col gap-2"
            ref={(el) => {
              // Get the viewport element (parent of this div) and store it in the shared map
              if (el && el.parentElement && columnScrollViewportRefs && columnIndex !== undefined) {
                columnScrollViewportRefs.current.set(columnIndex, el.parentElement as HTMLDivElement);
              }
            }}
          >
            {/* REAL BILL CARDS */}
            {bills.map((bill, index) =>
              readOnly ? (
                <KanbanCard
                  key={bill.id}
                  ref={(el) => {
                    if (el) billCardRefsToUse.current.set(bill.id, el);
                  }}
                  bill={bill}
                  isDragging={false}
                  onCardClick={onCardClick}
                  onUnadopt={onUnadopt}
                  showUnadoptButton={showUnadoptButton}
                  boardMode={boardMode}
                  orgTestimonyState={orgTestimonyBillIds?.has(bill.id) ? 'submitted' : undefined}
                  isTracked={trackedBillIds?.has(bill.id) ?? false}
                  onTrackForSelf={onTrackForSelf}
                />
              ) : (
                <Draggable key={bill.id} draggableId={bill.id} index={index}>
                  {(provided, snapshot) => (
                    <KanbanCard
                      ref={(el) => {
                        provided.innerRef(el);
                        if (el) billCardRefsToUse.current.set(bill.id, el);
                      }}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      bill={bill}
                      isDragging={snapshot.isDragging}
                      onCardClick={onCardClick}
                      onUnadopt={onUnadopt}
                      showUnadoptButton={showUnadoptButton}
                      boardMode={boardMode}
                      orgTestimonyState={orgTestimonyBillIds?.has(bill.id) ? 'submitted' : undefined}
                      isTracked={trackedBillIds?.has(bill.id) ?? false}
                      onTrackForSelf={onTrackForSelf}
                      style={{
                        ...provided.draggableProps.style,
                      }}
                    />
                  )}
                </Draggable>
              )
            )}

            {/* Droppable placeholder goes here */}
            {children}

            {/* PENDING PROPOSALS (using TempBillCard component) */}
            {boardMode !== 'active-boards' && pendingCount > 0 && (
              <div className="mt-2 space-y-2">
                {pendingTempBills.map((tb) => (
                  <TempBillCard
                    key={`pending-${tb.id}`}
                    tempBill={tb}
                    canModerate={canModerate}
                    onApproveTemp={onApproveTemp}
                    onRejectTemp={onRejectTemp}
                    onUndoProposal={onUndoProposal}
                    onTempCardClick={onTempCardClick}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Empty state */}
          {!bills.length && pendingCount === 0 && !children && (
            <p className="p-4 text-center text-sm text-muted-foreground">No bills in this stage.</p>
          )}
        </ScrollArea>
      </div>
    );
  }
);

KanbanColumn.displayName = 'KanbanColumn';
