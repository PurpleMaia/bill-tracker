import React, { useState } from 'react';
import { cn, formatBillStatusName, todayHawaii } from '@/lib/utils';
import { canAssignBills } from '@/lib/permissions';
import { Sparkles, X, Check, Users, Clock, Info, PenLine, UserPlus } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '@/components/ui/button';
import { CardTagSelector } from '../tags/card-tag-selector';
import { getNextDeadline } from '@/lib/dead-bill';
import { isTestimonyUrgent } from '@/lib/testimony-eligibility';
import { parseHearingDatetime, getTestimonyCountdownLabel } from '@/lib/hearing-schedule';
import type { SessionDeadlines } from '@/lib/dead-bill';
import { DeadBillInfoPopover } from './dead-bill-info-popover';
import type { BillStatus as DBBillStatus } from '@/db/types';
import deadlinesJson from '@/data/session-deadlines-2026.json';
import { useBills } from '@/hooks/contexts/bills-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { AssignBillDialog } from './assign-bill-dialog';
import type { Bill } from '@/types/legislation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { updateFoodStatusOrCreateBill } from '@/db/queries/bills-write';
import { toast } from '@/hooks/use-toast';
import { cardVisibility } from '@/lib/board-display';

interface KanbanCardProps extends React.HTMLAttributes<HTMLDivElement> {
  bill: Bill;
  isDragging: boolean;
  onCardClick: (bill: Bill) => void;
  onUnadopt?: (billId: string) => void;
  showUnadoptButton?: boolean;
  isHighlighted?: boolean;
  boardMode?: import('@/lib/board-display').BoardMode;
  orgTestimonyState?: 'submitted' | undefined;
  onTrackForSelf?: (bill: Bill) => void;
}

const KanbanCardComponent = React.forwardRef<HTMLDivElement, KanbanCardProps>(
    ({ bill, isDragging, onCardClick, onUnadopt, showUnadoptButton = false, isHighlighted = false, boardMode = 'own', orgTestimonyState, onTrackForSelf, className, style, ...props }, ref) => {

    const [isProcessing, setIsProcessing] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [showRemoveDialog, setShowRemoveDialog] = useState(false);
    const { acceptLLMChange, rejectLLMChange, removeBill, testimonyStatuses } = useBills();
    const { user, activeTenant } = useAuth();
    const vis = cardVisibility(boardMode);

    const canSeeTracking = activeTenant?.orgRole === 'admin';
    const trackedBy = bill.tracked_by ?? [];
    const trackedCount = bill.tracked_count ?? trackedBy.length;

    const today = todayHawaii();
    const nextDeadline = !bill.dead && bill.committee_assignment && bill.current_bill_status
      ? getNextDeadline(
          bill.bill_number,
          bill.current_bill_status as DBBillStatus,
          bill.committee_assignment,
          deadlinesJson as SessionDeadlines,
          today
        )
      : null;

    const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onCardClick(bill);
    };

    const handleAccept = async () => {
      setIsProcessing(true);
      try { await acceptLLMChange(bill.id); } finally { setIsProcessing(false); }
    };

    const handleReject = async () => {
      setIsProcessing(true);
      try { await rejectLLMChange(bill.id); } finally { setIsProcessing(false); }
    };

    const handleRemoveBill = async () => {
      setIsRemoving(true);
      try {
        await updateFoodStatusOrCreateBill(bill, false, activeTenant?.tenantId);
        removeBill(bill.id);
        toast({ title: 'Bill Removed', description: `${bill.bill_number} removed from the board.`, duration: 5000 });
        setShowRemoveDialog(false);
      } catch (error) {
        console.error('Error removing bill from board:', error);
      } finally {
        setIsRemoving(false);
      }
    };

    // Deadline urgency
    const deadlineDaysAway = nextDeadline
      ? Math.ceil((new Date(nextDeadline.date + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const isUrgent = deadlineDaysAway !== null && deadlineDaysAway <= 7;

    // Testimony progress: submitted > draft written > due (hearing scheduled)
    const testimonyState = boardMode === 'active-boards' ? orgTestimonyState : testimonyStatuses[bill.id]; // undefined | 'draft' | 'submitted'
    const testimonyDue =
      !testimonyState && !bill.dead && isTestimonyUrgent(bill.current_bill_status as DBBillStatus);
    const hearingAt = testimonyDue && bill.latest_update
      ? parseHearingDatetime(bill.latest_update.statustext)
      : null;
    const countdownLabel = hearingAt ? getTestimonyCountdownLabel(hearingAt, new Date()) : null;
    const testimonyChipTitle = hearingAt
      ? `Hearing ${hearingAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — submit testimony at least 24 hours before the hearing`
      : 'Hearing scheduled — submit testimony at least 24 hours before the hearing';

    return (
        <div
            ref={ref}
            className={cn(
                "group relative rounded-lg border bg-card text-card-foreground transition-all duration-200 w-full",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                "flex flex-col overflow-hidden",
                isDragging
                  ? "opacity-80 shadow-xl rotate-2 scale-105 cursor-grabbing"
                  : "shadow-sm hover:shadow-md cursor-grab",
                isHighlighted && "ring-2 ring-ring ring-offset-2",
                className
            )}
            style={style}
            {...props}
            tabIndex={0}
        >
            {/* Grayed-out content layer for dead bills */}
            <div className={cn(
              "flex flex-col",
              bill.dead && "opacity-50 grayscale-[50%]"
            )}>

            {/* Main clickable area */}
            <div
                className="flex flex-col w-full cursor-pointer p-3 pb-2"
                onClick={handleCardClick}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleCardClick(e as any);
                    }
                }}
                role="button"
                tabIndex={0}
                aria-label={`View details for ${bill.bill_number}: ${bill.bill_title}`}
            >
                {/* Tags row + dead badge */}
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <CardTagSelector billId={bill.id} billTags={bill.tags} />
                  </div>                  
                </div>

                {/* Bill number + year + X remove button */}
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm font-semibold tracking-tight">
                    {bill.bill_number}
                  </span>
                  {bill.year && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1 rounded-md text-muted-foreground">
                      {bill.year}
                    </Badge>
                  )}
                  {vis.showRemoveAssign && canAssignBills(user, activeTenant?.orgRole) && (
                    <div className="ml-auto flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!bill.dead && (
                        <AssignBillDialog
                          bill={bill}
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="cursor-pointer h-5 w-5 p-0 text-muted-foreground hover:text-primary"
                              onClick={(e) => e.stopPropagation()}
                              title="Assign to user"
                              aria-label={`Assign ${bill.bill_number} to a user`}
                            >
                              <UserPlus className="h-3 w-3" />
                            </Button>
                          }
                        />
                      )}
                      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="cursor-pointer h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setShowRemoveDialog(true); }}
                            disabled={isRemoving}
                            title="Remove from board"
                            aria-label={`Remove ${bill.bill_number} from the board`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Bill from Board?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will set the bill as not food-related. You can re-add it later.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => { e.stopPropagation(); handleRemoveBill(); }}
                              className="bg-destructive hover:bg-destructive/90"
                              disabled={isRemoving}
                            >
                              {isRemoving ? 'Removing...' : 'Remove'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>

                {/* Description — 2 lines with ellipsis */}
                <p className="text-sm text-foreground line-clamp-2 mt-1 leading-relaxed">
                  {bill.description}
                </p>

                {/* Latest update + committee referral */}
                {bill.latest_update && (
                  <div className="mt-1.5 space-y-0.5">
                    <span className="text-xs text-muted-foreground">
                      Latest update &middot; {new Date(bill.latest_update.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                    </span>
                    <p className="text-xs text-muted-foreground truncate">
                      {bill.latest_update.statustext}
                    </p>
                  </div>
                )}

                {/* Status badges footer */}
                <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
                    {testimonyState === 'submitted' && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 h-5 text-[10px] font-medium text-primary shrink-0"
                        title="You submitted testimony for this bill"
                      >
                        <Check className="h-2.5 w-2.5" />
                        Submitted
                      </span>
                    )}
                    {testimonyState === 'draft' && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 h-5 text-[10px] font-medium text-secondary-foreground shrink-0"
                        title="You have a testimony draft for this bill"
                      >
                        <PenLine className="h-2.5 w-2.5" />
                        Draft written
                      </span>
                    )}
                    {vis.showTestimonyAlert && testimonyDue && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 h-5 text-[10px] font-medium text-destructive shrink-0"
                        title={testimonyChipTitle}
                      >
                        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 motion-safe:animate-ping" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                        </span>
                        <PenLine className="h-2.5 w-2.5" />
                        {countdownLabel ? `Testimony ${countdownLabel}` : 'Testimony due'}
                      </span>
                    )}
                    {/* <Badge variant="outline" className="text-[10px] h-5 px-2 text-muted-foreground rounded-full">
                      {formatBillStatusName(bill.current_bill_status)}
                    </Badge> */}
                    {vis.showTrackedCount && canSeeTracking && (
                      <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Users className="h-2.5 w-2.5" />
                        <span>{trackedCount}</span>
                      </div>
                    )}

                  {/* Deadline — plain text normally, promoted to an ochre chip when ≤7 days out */}
                  <div className="flex items-center gap-2 ml-auto">
                    {nextDeadline && (
                      <div
                        className={cn(
                          "flex items-center gap-1 text-[10px]",
                          isUrgent
                            ? "rounded-full border border-ochre/40 bg-ochre-soft px-2 h-5 font-medium text-ochre shrink-0"
                            : "gap-0.5 text-muted-foreground"
                        )}
                        title={isUrgent ? `Next deadline in ${deadlineDaysAway} day${deadlineDaysAway === 1 ? '' : 's'}` : 'Next deadline'}
                      >
                        <Clock className="h-2.5 w-2.5" />
                        <span>
                          {new Date(nextDeadline.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    )}

                    {bill.dead && (
                    <Badge variant="destructive" className="text-[10px] h-5 px-2 text-white rounded-full shrink-0">
                      Failed
                    </Badge>
                  )}
                  </div>
                </div>
            </div>

            {/* LLM Action Buttons */}
            {vis.showLlmActions && bill.llm_suggested && !bill.llm_processing && (
              <div className="px-3 pb-3 flex gap-2 pt-2 border-t border-border">
                <Button
                  size="sm" variant="outline" onClick={handleAccept} disabled={isProcessing}
                  className="flex-1 text-xs h-7 bg-olive-soft border-olive/60 text-foreground hover:bg-olive/30"
                >
                  <Check className="h-3 w-3 mr-1" /> Accept
                </Button>
                <Button
                  size="sm" variant="outline" onClick={handleReject} disabled={isProcessing}
                  className="flex-1 text-xs h-7 bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20"
                >
                  <X className="h-3 w-3 mr-1" /> Reject
                </Button>
              </div>
            )}

            {bill.llm_processing && (
              <div className="px-3 pb-3 pt-2 border-t border-border">
                <div className="flex items-center justify-center text-xs text-primary gap-1">
                  <Sparkles className="h-3 w-3 animate-pulse" />
                  <span className="animate-pulse">AI Processing...</span>
                </div>
              </div>
            )}

            {vis.showTrackForSelf && (
              <div className="px-3 pb-3 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onTrackForSelf?.(bill); }}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  Track this bill
                </button>
              </div>
            )}
            </div>{/* end grayed-out content layer */}

            {/* Dead info popover — bottom-right, layered on top of grayed content */}
            {bill.dead && (
              <div className="absolute top-3 right-2 z-10">
              <DeadBillInfoPopover
                  billNumber={bill.bill_number}
                  billStatus={bill.current_bill_status}
                  billUrl={bill.bill_url}
                  committeeAssignment={bill.committee_assignment}
                  latestUpdate={bill.latest_update}
                >
                  <button
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-sm"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Why did this bill fail?"
                  >
                    <Info className="h-5 w-5" />
                  </button>
                </DeadBillInfoPopover>
              </div>
            )}
      </div>
    );
});
KanbanCardComponent.displayName = "KanbanCard";

const arePropsEqual = (prevProps: KanbanCardProps, nextProps: KanbanCardProps): boolean => {
  if (prevProps.bill.id !== nextProps.bill.id) return false;
  if (prevProps.isDragging !== nextProps.isDragging) return false;
  if (prevProps.isHighlighted !== nextProps.isHighlighted) return false;
  if (prevProps.showUnadoptButton !== nextProps.showUnadoptButton) return false;

  const prev = prevProps.bill;
  const next = nextProps.bill;

  if (prev.bill_number !== next.bill_number) return false;
  if (prev.year !== next.year) return false;
  if (prev.description !== next.description) return false;
  if (prev.current_bill_status !== next.current_bill_status) return false;
  if (prev.dead !== next.dead) return false;
  if (prev.committee_assignment !== next.committee_assignment) return false;
  if (prev.llm_suggested !== next.llm_suggested) return false;
  if (prev.llm_processing !== next.llm_processing) return false;
  if (prev.tracked_count !== next.tracked_count) return false;

  const prevTags = prev.tags || [];
  const nextTags = next.tags || [];
  if (prevTags.length !== nextTags.length) return false;
  if (prevTags.some((tag, i) => tag.id !== nextTags[i]?.id)) return false;

  const prevUpdate = prev.latest_update;
  const nextUpdate = next.latest_update;
  if (prevUpdate?.statustext !== nextUpdate?.statustext) return false;
  if (prevUpdate?.date !== nextUpdate?.date) return false;

  const prevTracked = prev.tracked_by || [];
  const nextTracked = next.tracked_by || [];
  if (prevTracked.length !== nextTracked.length) return false;

  return true;
};

export const KanbanCard = React.memo(KanbanCardComponent, arePropsEqual);
