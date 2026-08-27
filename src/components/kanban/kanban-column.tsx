

'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import type { Bill, TempBill } from '@/types/legislation';
import { KanbanCard } from './kanban-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Draggable } from '@hello-pangea/dnd';
import { cn } from '@/lib/core/utils';
import { TempBillCard } from './temp-card';
import { HelpCircle, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COLUMN_DESCRIPTIONS } from '@/lib/bills/kanban-columns';
import { columnTrackSearchHref } from '@/lib/bills/track-bill-links';
import { useAuth } from '@/hooks/contexts/auth-context';

// Adds readOnly prop to control card rendering
// When readOnly=true, cards aren't wrapped in Draggable components

/** Map a column ID to its legislative-phase background class. */
function getColumnPhaseBg(columnId: string): string {
  if (columnId === 'vetoList') return 'bg-[#f8d7d2]';
  if (columnId === 'governorSigns' || columnId === 'lawWithoutSignature') return 'bg-[#d6e8d4]';
  // Entry "waiting" columns get olive: a bill just arrived at a chamber and is
  // waiting for its FIRST hearing there. That's introduced (originating) and
  // crossoverWaiting1 (just crossed over). The later waiting columns
  // (waiting2/3 and crossoverWaiting2/3) fall through to gray — they're
  // between-committee holds, not chamber entry points.
  if (columnId === 'introduced' || columnId === 'simpleWaiting' || columnId === 'crossoverWaiting1' || columnId === 'simpleCrossoverWaiting')
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

  boardMode?: import('@/lib/bills/board-display').BoardMode;
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
              {/* Tap/click to reveal what this stage means. */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`What does "${title}" mean?`}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <h3 className="mb-1 text-sm font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {COLUMN_DESCRIPTIONS[columnId] ?? 'No description available for this stage.'}
                  </p>
                </PopoverContent>
              </Popover>
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

            {/* Track-more button at the bottom of a non-empty list. Own board
                only — it links to the search page pre-filtered to this stage.
                The empty column shows its own centered version instead, so this
                is gated to when there are actually cards above it. */}
            {bills.length > 0 && activeTenant && boardMode === 'own' && (
              <Link
                href={columnTrackSearchHref(columnId)}
                className="mt-1 inline-flex items-center justify-center gap-1.5 self-center rounded-md border border-dashed px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-3.5 w-3.5" />
                Track bills at this stage
              </Link>
            )}
          </div>

          {/* Empty state. On your own board it invites you to the search page
              (pre-filtered to this stage) to track a bill; on public/read-only
              boards there's nothing to track, so it stays a neutral line. */}
          {!bills.length && pendingCount === 0 && !children && (
            activeTenant && boardMode === 'own' ? (
              <div className="flex flex-col items-center gap-2 p-4 text-center">                
                <Link
                  href={columnTrackSearchHref(columnId)}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Track bills at this stage
                </Link>
              </div>
            ) : (
              <p className="p-4 text-center text-sm text-muted-foreground">No bills in this stage.</p>
            )
          )}
        </ScrollArea>
      </div>
    );
  }
);

KanbanColumn.displayName = 'KanbanColumn';
