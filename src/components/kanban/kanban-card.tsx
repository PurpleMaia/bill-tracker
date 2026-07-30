import React, { useState } from 'react';
import { cn, formatBillHeadline, formatBillStatusName, formatRelativeDate, todayHawaii } from '@/lib/core/utils';
import { canAssignBills } from '@/lib/auth/permissions';
import { parseCommittees } from '@/lib/bills/dead-bill';
import { isAwaitingHearing } from '@/lib/bills/kanban-columns';
import { committeeFullName } from '@/lib/testimony/committees';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Shadcn tooltip wrapper for the card's chips — replaces native title attrs. */
function ChipTooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
import { Sparkles, X, Check, Users, Info, PenLine, UserPlus, Hourglass, AlarmClock, History, Loader2, Plus } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '@/components/ui/button';
import { CardTagSelector } from '../tags/card-tag-selector';
import { getNextDeadline, getDeadlineTier } from '@/lib/bills/dead-bill';
import { SESSION_DEADLINES } from '@/lib/testimony/session-deadlines';
import { isTestimonyUrgent } from '@/lib/testimony/testimony-eligibility';
import { parseHearingDatetime, getTestimonyCountdownLabel } from '@/lib/testimony/hearing-schedule';
import type { SessionDeadlines } from '@/lib/bills/dead-bill';
import { DeadBillInfoPopover } from './dead-bill-info-popover';
import type { BillStatus as DBBillStatus } from '@/db/types';
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
import { cardVisibility } from '@/lib/bills/board-display';

interface KanbanCardProps extends React.HTMLAttributes<HTMLDivElement> {
  bill: Bill;
  isDragging: boolean;
  onCardClick: (bill: Bill) => void;
  onUnadopt?: (billId: string) => void;
  showUnadoptButton?: boolean;
  isHighlighted?: boolean;
  boardMode?: import('@/lib/bills/board-display').BoardMode;
  orgTestimonyState?: 'submitted' | undefined;
  isTracked?: boolean;
  onTrackForSelf?: (bill: Bill) => void | Promise<void>;
}

const KanbanCardComponent = React.forwardRef<HTMLDivElement, KanbanCardProps>(
    ({ bill, isDragging, onCardClick, onUnadopt, showUnadoptButton = false, isHighlighted = false, boardMode = 'own', orgTestimonyState, isTracked = false, onTrackForSelf, className, style, ...props }, ref) => {

    const [isProcessing, setIsProcessing] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [showRemoveDialog, setShowRemoveDialog] = useState(false);
    const [isTracking, setIsTracking] = useState(false);
    const [showTrackDialog, setShowTrackDialog] = useState(false);
    const { acceptLLMChange, rejectLLMChange, removeBill, testimonyStatuses, showArchived } = useBills();
    const { user, activeTenant } = useAuth();
    const vis = cardVisibility(boardMode);

    const canSeeTracking = activeTenant?.orgRole === 'admin';
    const trackedBy = bill.tracked_by ?? [];
    const trackedCount = bill.tracked_count ?? trackedBy.length;

    const canAssign = canAssignBills(user, activeTenant?.orgRole);
    // Users who can't remove a bill from the board can still stop tracking it.
    const canUntrack = !canAssign && showUnadoptButton && !!onUnadopt;

    const headline = formatBillHeadline(bill);
    const committeeReferrals = bill.committee_assignment ? parseCommittees(bill.committee_assignment) : [];
    const committeeCodes = committeeReferrals.length > 0 ? committeeReferrals.join(' · ') : null;

    const today = todayHawaii();
    const nextDeadline = !bill.dead && bill.committee_assignment && bill.current_bill_status
      ? getNextDeadline(
          bill.bill_number,
          bill.current_bill_status as DBBillStatus,
          bill.committee_assignment,
          SESSION_DEADLINES,
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

    const handleTrackForSelf = async () => {
      setIsTracking(true);
      try {
        await onTrackForSelf?.(bill);
        setShowTrackDialog(false);
      } finally {
        setIsTracking(false);
      }
    };

    // Deadline urgency
    const deadlineDaysAway = nextDeadline
      ? Math.ceil((new Date(nextDeadline.date + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Testimony progress: submitted > draft written > due (hearing scheduled)
    const testimonyState = boardMode === 'active-boards' ? orgTestimonyState : testimonyStatuses[bill.id]; // undefined | 'draft' | 'submitted'
    const testimonyDue =
      !testimonyState && !bill.dead && isTestimonyUrgent(bill.current_bill_status as DBBillStatus);
    const hearingAt = testimonyDue && bill.latest_update
      ? parseHearingDatetime(bill.latest_update.statustext)
      : null;
    const countdownLabel = hearingAt ? getTestimonyCountdownLabel(hearingAt, new Date()) : null;

    // Bottom-right fate countdown while the bill waits for a hearing: if the
    // committee chair doesn't schedule it before the next deadline, it fails.
    // Neutral framing — informative whether the viewer supports or opposes the
    // bill. The Failed badge takes over the corner when the bill dies.
    const showDeadlineCountdown =
      !bill.dead &&
      nextDeadline !== null &&
      deadlineDaysAway !== null &&
      isAwaitingHearing(bill.current_bill_status);
    const deadlineTier = deadlineDaysAway !== null ? getDeadlineTier(deadlineDaysAway) : null;
    const testimonyChipTitle = hearingAt
      ? `Hearing ${hearingAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — submit testimony at least 24 hours before the hearing`
      : 'Hearing scheduled — submit testimony at least 24 hours before the hearing';

    return (
        <div
            ref={ref}
            className={cn(
                "group relative rounded-lg border bg-card text-card-foreground transition-all duration-200 w-full",
                // Red wash as a gradient layer over the opaque card white — a
                // translucent bg-destructive/5 would replace bg-card and blend
                // with the olive column behind, reading yellow.
                bill.dead && "[background-image:linear-gradient(hsl(var(--destructive)/0.05),hsl(var(--destructive)/0.05))] border-destructive/20",
                // Keyboard-only focus ring: :focus-visible stays false for mouse
                // clicks, so selecting a card with the mouse draws no border.
                "outline-none focus-visible:ring-2 has-[:focus-visible]:ring-2 ring-ring ring-offset-2",
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
                  {/* Reference label — the headline below is the card's primary text */}
                  <span className="text-xs font-medium tracking-wide text-muted-foreground">
                    {bill.bill_number}
                  </span>
                  {/* Year only matters when archived (older-session) bills are
                      mixed into the board — redundant on a single-session view */}
                  {bill.year && showArchived && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1 rounded-md text-muted-foreground">
                      {bill.year}
                    </Badge>
                  )}
                  {(canAssign || canUntrack) && (
                    <div className="ml-auto flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canUntrack && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="cursor-pointer h-5 w-5 p-0 text-muted-foreground hover:bg-secondary hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); onUnadopt?.(bill.id); }}
                          title="Untrack bill"
                          aria-label={`Untrack ${bill.bill_number}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                      {canAssign && !bill.dead && (
                        <AssignBillDialog
                          bill={bill}
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="cursor-pointer h-5 w-5 p-0 text-muted-foreground hover:bg-secondary hover:text-primary"
                              onClick={(e) => e.stopPropagation()}
                              title="Assign to user"
                              aria-label={`Assign ${bill.bill_number} to a user`}
                            >
                              <UserPlus className="h-3 w-3" />
                            </Button>
                          }
                        />
                      )}
                      {canAssign && !bill.dead && (
                      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="cursor-pointer h-5 w-5 p-0 text-muted-foreground hover:bg-secondary hover:text-destructive"
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
                              {activeTenant
                                ? `This bill will be removed from your organization's list, including for anyone else in ${activeTenant.name} tracking it. You can track it again anytime using the Track Bill button.`
                                : 'This bill will no longer be tracked on your list, and it will be removed for anyone else tracking it. You can track it again anytime using the Track Bill button.'}
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
                      )}
                    </div>
                  )}
                </div>

                {/* Headline — curated nickname or cleaned-up official title */}
                {headline && (
                  <p className="mt-1 text-sm font-semibold leading-snug truncate" title={headline}>
                    {headline}
                  </p>
                )}

                {/* Description — 2 lines with ellipsis */}
                <p className={cn(
                  'line-clamp-2 leading-relaxed',
                  headline ? 'mt-0.5 text-xs text-muted-foreground' : 'mt-1 text-sm text-foreground'
                )}>
                  {bill.description}
                </p>

                {/* Latest activity — relative time for scannability; the full
                    date and untruncated text live in the tooltip */}
                {bill.latest_update && (
                  <ChipTooltip
                    content={
                      <>
                        <p className="font-medium">
                          {new Date(bill.latest_update.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p>{bill.latest_update.statustext}</p>
                      </>
                    }
                  >
                    <div className="mt-2 flex items-center gap-1 rounded-md bg-border/30 px-2 py-1.5">
                      <History className="h-3 w-3 shrink-0 text-foreground/70" aria-hidden="true" />
                      <span className="shrink-0 text-xs font-medium text-foreground/70">
                        {formatRelativeDate(bill.latest_update.date)}
                      </span>
                      <p className="min-w-0 truncate text-xs text-muted-foreground">
                        &mdash; {bill.latest_update.statustext}
                      </p>
                    </div>
                  </ChipTooltip>
                )}

                {/* Status badges footer.
                    Bottom-left: committee identity, superseded by testimony
                    progress chips when there's testimony state.
                    Bottom-right: deadline countdown, superseded by Failed. */}
                <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
                    {testimonyState === 'submitted' && (
                      <ChipTooltip content="You submitted testimony for this bill">
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 h-5 text-[10px] font-medium text-primary shrink-0">
                          <Check className="h-2.5 w-2.5" />
                          Submitted
                        </span>
                      </ChipTooltip>
                    )}
                    {testimonyState === 'draft' && (
                      <ChipTooltip content="You have a testimony draft for this bill">
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 h-5 text-[10px] font-medium text-secondary-foreground shrink-0">
                          <PenLine className="h-2.5 w-2.5" />
                          Draft written
                        </span>
                      </ChipTooltip>
                    )}
                    {testimonyDue && (
                      <ChipTooltip content={testimonyChipTitle}>
                        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 h-5 text-[10px] font-medium text-destructive shrink-0">
                          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 motion-safe:animate-ping" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                          </span>
                          <PenLine className="h-2.5 w-2.5" />
                          {countdownLabel ? `Testimony ${countdownLabel}` : 'Testimony due'}
                        </span>
                      </ChipTooltip>
                    )}
                    {!testimonyState && !testimonyDue && committeeCodes && (
                      <ChipTooltip
                        content={
                          <div className="space-y-0.5">
                            <p className="font-medium">Referred to:</p>
                            {committeeReferrals.map((code) => (
                              <p key={code}>
                                <span className="font-medium">{code}</span> &mdash; {committeeFullName(code)}
                              </p>
                            ))}
                          </div>
                        }
                      >
                        <span className="inline-flex items-center rounded-full border border-border bg-secondary/60 px-2 h-5 text-[10px] font-medium text-secondary-foreground shrink-0">
                          {committeeCodes}
                        </span>
                      </ChipTooltip>
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

                  {/* Bottom-right: tiered deadline countdown for any bill with an
                      upcoming deadline — Failed takes over the corner when the
                      bill dies. Waiting-stage bills get the committee-chair
                      framing in the tooltip; later stages a neutral one. */}
                  <div className="flex items-center gap-2 ml-auto">
                    {bill.dead ? (
                      <Badge variant="destructive" className="text-[10px] h-5 px-2 text-white rounded-full shrink-0">
                        Failed
                      </Badge>
                    ) : nextDeadline && deadlineDaysAway !== null && (
                      <ChipTooltip
                        content={
                          showDeadlineCountdown
                            ? `If the committee chair doesn't schedule this bill by ${nextDeadline.name} (${new Date(nextDeadline.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}), it fails. ${deadlineDaysAway <= 0 ? 'Due today.' : `${deadlineDaysAway} day${deadlineDaysAway === 1 ? '' : 's'} left.`}`
                            : `${nextDeadline.name} deadline: ${new Date(nextDeadline.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. ${deadlineDaysAway <= 0 ? 'Due today.' : `${deadlineDaysAway} day${deadlineDaysAway === 1 ? '' : 's'} left.`}`
                        }
                      >
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 h-5 text-[10px] font-medium shrink-0',
                            deadlineTier === 'urgent' && 'border-destructive/30 bg-destructive/10 text-destructive',
                            deadlineTier === 'warning' && 'border-ochre/40 bg-ochre-soft text-ochre',
                            deadlineTier === 'safe' && 'border-border bg-secondary/60 text-muted-foreground'
                          )}
                        >
                          {deadlineTier === 'urgent' ? (
                            <AlarmClock className="h-2.5 w-2.5" />
                          ) : (
                            <Hourglass className="h-2.5 w-2.5" />
                          )}
                          {new Date(nextDeadline.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {' · '}
                          {deadlineDaysAway <= 0 ? 'Today' : `${deadlineDaysAway}d`}
                        </span>
                      </ChipTooltip>
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
                {isTracked ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground cursor-default"
                    aria-label={`You already track ${bill.bill_number}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Check className="h-3 w-3" />
                    Tracked
                  </button>
                ) : (
                  <AlertDialog open={showTrackDialog} onOpenChange={setShowTrackDialog}>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        disabled={isTracking}
                        onClick={(e) => { e.stopPropagation(); setShowTrackDialog(true); }}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
                        aria-label={`Track ${bill.bill_number}`}
                      >
                        {isTracking ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Tracking…
                          </>
                        ) : (
                          <>
                            <Plus className="h-3 w-3" />
                            Track this bill
                          </>
                        )}
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Track this bill?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This adds {bill.bill_number} to your organization&apos;s board so your team can track it too.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isTracking} onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleTrackForSelf(); }}
                          disabled={isTracking}
                        >
                          {isTracking ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Tracking…
                            </>
                          ) : (
                            'Track bill'
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
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
                  removeSlot={canAssign ? (
                    <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setShowRemoveDialog(true); }}
                          disabled={isRemoving}
                          aria-label={`Remove ${bill.bill_number} from the board`}
                        >
                          <X className="h-3.5 w-3.5 mr-1.5" />
                          Remove from board
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Bill from Board?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {activeTenant
                              ? `This bill will be removed from your organization's list, including for anyone else in ${activeTenant.name} tracking it. You can track it again anytime using the Track Bill button.`
                              : 'This bill will no longer be tracked on your list, and it will be removed for anyone else tracking it. You can track it again anytime using the Track Bill button.'}
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
                  ) : undefined}
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
  // Active-boards props: the org testimony Set arrives in a second async call
  // after bills load, flipping orgTestimonyState undefined -> 'submitted' with
  // no other prop change. Without these comparisons the memo would skip the
  // re-render and the "Submitted" chip would never appear. In 'own' mode these
  // props are constant, so the checks are always-equal and harmless.
  if (prevProps.boardMode !== nextProps.boardMode) return false;
  if (prevProps.orgTestimonyState !== nextProps.orgTestimonyState) return false;
  // isTracked flips false -> true after the current user tracks the bill (the
  // tracked-ids Set updates optimistically); without this the "Tracked" state
  // would never appear.
  if (prevProps.isTracked !== nextProps.isTracked) return false;
  if (prevProps.onTrackForSelf !== nextProps.onTrackForSelf) return false;

  const prev = prevProps.bill;
  const next = nextProps.bill;

  if (prev.bill_number !== next.bill_number) return false;
  if (prev.year !== next.year) return false;
  if (prev.nickname !== next.nickname) return false;
  if (prev.bill_title !== next.bill_title) return false;
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
