'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Bill, BillStatus, BillDetails, StatusUpdate } from '@/types/legislation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, todayHawaii } from '@/lib/core/utils';
import { FileText, Loader2, ExternalLink, Clock, PenLine, LayoutDashboard, Files, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMemo, useState } from 'react';
import RefreshStatusesButton from '../scraper/scrape-updates-button';
import { useBills } from '@/hooks/contexts/bills-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { LoginDialog } from '@/components/auth/login-dialog';
import { COLUMN_TITLES, KANBAN_COLUMNS } from '@/lib/bills/kanban-columns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import { updateBillStatus } from '@/db/queries/bills-write';
import { getBillDetails } from '@/db/queries/bills-read';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { TagSelector } from '../tags/tag-selector';
import { BillBriefing } from './bill-briefing';
import { VersionsReportsTab } from './versions-reports-tab';
import { PROGRESS_STAGES, getProgressValue, getCurrentStageName } from '@/lib/bills/progress-stages';
import { Term } from '@/components/ui/term';
import { resolveDeadlineTerm } from '@/lib/glossary/resolvers';
import { BillBreakdownButton } from './bill-breakdown';
import { isBillDead, getNextDeadline, isFiscalBill, isEnacted } from '@/lib/bills/dead-bill';
import { getTestimonyEligibility, isTestimonyUrgent } from '@/lib/testimony/testimony-eligibility';
import { getTestimonyDeadline } from '@/lib/testimony/hearing-schedule';
import type { BillStatus as DBBillStatus } from '@/db/types';
import type { BoardMode } from '@/lib/bills/board-display';
import { SESSION_DEADLINES } from '@/lib/testimony/session-deadlines';

interface BillDetailsDialogProps {
  billID: string | null;
  isOpen: boolean;
  onClose: () => void;
  boardMode?: BoardMode;
  /**
   * Optional control rendered beside the header CTAs. The search page passes a
   * Track button here — a bill opened from search may not be tracked yet, while
   * one opened from a board always is. Kept as a slot so the dialog stays
   * agnostic about where it was opened from.
   */
  trackSlot?: React.ReactNode;
}

interface DialogTab {
  id: 'overview' | 'versions' | 'updates';
  label: string;
  /** Used below the `sm` breakpoint, where three full labels don't fit. */
  shortLabel?: string;
  icon: React.ElementType;
  /** Hidden on desktop — see the note on the `updates` tab below. */
  mobileOnly?: boolean;
}

/**
 * Dialog tabs. `mobileOnly` tabs are filtered out on desktop: Status Updates is
 * a side-by-side panel there, so it needs no tab of its own.
 *
 * Typed as DialogTab[] rather than `as const` so the optional keys are visible
 * on every element — `as const` narrows each entry to its own literal type, and
 * reading `.mobileOnly` off the resulting union does not compile.
 */
const TABS: readonly DialogTab[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'versions', label: 'Versions & Reports', shortLabel: 'Versions', icon: Files },
  { id: 'updates', label: 'Status Updates', shortLabel: 'Updates', icon: Clock, mobileOnly: true },
];

export function BillDetailsDialog({ billID, isOpen, onClose, boardMode = 'own', trackSlot }: BillDetailsDialogProps) {
  const { bills, setBills, setTempBills, proposeStatusChange, updateBill, viewMode } = useBills();
  const { user, activeTenant } = useAuth();
  const isMobile = useIsMobile();
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [, setSaving] = useState<boolean>(false);
  const [billDetails, setBillDetails] = useState<BillDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  // 'updates' is a MOBILE-ONLY tab. On desktop Status Updates is a side-by-side
  // panel, so promoting it to a tab there would hide it behind a click; on mobile
  // the panels stack and it was stranded below a long Overview scroll.
  const [activeTab, setActiveTab] = useState<'overview' | 'versions' | 'updates'>('overview');

  // The board keeps only tracked/food-related bills in context, but this dialog
  // is also opened from /search over the FULL corpus, where the clicked bill is
  // usually absent from context. Fall back to the fetched billDetails (which
  // extends Bill) so a search result still renders instead of returning null.
  const contextBill = useMemo(() => bills.find(b => b.id === billID), [bills, billID]);
  const bill = contextBill ?? billDetails;

  useEffect(() => {
    if (isOpen && billID) {
      setLoadingDetails(true);
      setDetailsError(null);
      getBillDetails(billID)
        .then((details) => {
          if (details.updates) {
            details.updates = [...details.updates].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          }
          setBillDetails(details);
          setSelectedStatus(details.current_bill_status || '');
        })
        .catch(() => {
          setDetailsError('Failed to load bill details');
          toast({ title: 'Error', description: 'Failed to load bill details.', variant: 'destructive' });
        })
        .finally(() => setLoadingDetails(false));
    }
  }, [isOpen, billID]);

  useEffect(() => {
    if (!isOpen) { setSelectedStatus(''); setBillDetails(null); setDetailsError(null); setActiveTab('overview'); }
  }, [isOpen]);

  // 'updates' only exists on mobile. Crossing to desktop while it is selected
  // would leave every TabsContent inactive and the body blank, so fall back to
  // Overview — where Status Updates is visible as the right-hand panel anyway.
  useEffect(() => {
    if (!isMobile && activeTab === 'updates') setActiveTab('overview');
  }, [isMobile, activeTab]);

  // Nothing to render yet: no context bill and details haven't arrived. While
  // the fetch is in flight show a minimal loading shell (a search result not in
  // context would otherwise flash nothing); once it resolves `bill` is set from
  // billDetails and the full dialog renders below.
  if (!bill) {
    if (!isOpen) return null;
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[100vw] sm:max-w-2xl h-[100dvh] sm:h-auto flex flex-col items-center justify-center gap-3 p-8">
          {detailsError ? (
            <p className="text-sm text-destructive">Failed to load bill details.</p>
          ) : (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Loading bill details…</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // Panels expect a fully-loaded BillDetails. Once getBillDetails resolves it's
  // authoritative (its mapper always sets versions/reports to arrays), so use it
  // directly. Before it loads, fall back to the list `bill` with empty
  // versions/reports so the pre-load render never hits "versions is not
  // iterable". We do NOT merge the two — merging would let the mapper's
  // intentional `undefined` fields clobber real values on the list bill.
  const billForPanels: BillDetails = billDetails ?? {
    ...(bill as BillDetails),
    versions: [],
    reports: [],
  };

  const currentStatus = billDetails?.current_bill_status || bill.current_bill_status;
  const progressValue = getProgressValue(currentStatus as BillStatus);
  const currentStageName = getCurrentStageName(currentStatus as BillStatus);
  const isInternInAllBillsView = user?.role === 'user' && viewMode === 'all-bills';
  const canEditBill = !isInternInAllBillsView;
  const canSeeTracking = boardMode !== 'active-boards' && activeTenant?.orgRole === 'admin';
  // Only org admins may change a bill's org status; workers and public users don't see the control.
  const canChangeStatus = activeTenant?.orgRole === 'admin';

  // Derive dead reason and deadline
  const committeeAssign = billDetails?.committee_assignment || bill.committee_assignment;
  const today = todayHawaii();

  const deadReason = (bill.dead && committeeAssign && billDetails)
    ? isBillDead(
        {
          bill_number: billDetails.bill_number || bill.bill_number,
          bill_status: (billDetails.current_bill_status || bill.current_bill_status) as DBBillStatus,
          committee_assignment: committeeAssign,
        },
        (billDetails.updates || []).map(u => ({ statustext: u.statustext, date: u.date, chamber: u.chamber })),
        SESSION_DEADLINES,
        today,
      ).reason
    : null;

  const nextDeadline = (!bill.dead && committeeAssign)
    ? getNextDeadline(
        bill.bill_number,
        (billDetails?.current_bill_status || bill.current_bill_status) as DBBillStatus,
        committeeAssign,
        SESSION_DEADLINES,
        today
      )
    : null;

  const fiscal = committeeAssign ? isFiscalBill(committeeAssign) : false;

  const latestUpdateText =
    billDetails?.updates?.[0]?.statustext ?? bill.latest_update?.statustext ?? null;
  // Derive the hearing window first (shared with the card / testimonies view) so
  // eligibility can close testimony once THIS hearing has passed, not only at the
  // session's final deadline — otherwise the card's "Testimony closed" chip and
  // the dialog's Write action disagree.
  const testimonyDeadline = getTestimonyDeadline({
    billStatus: currentStatus as DBBillStatus,
    latestStatusText: latestUpdateText,
    now: new Date(),
  });

  const testimonyEligibility = getTestimonyEligibility({
    dead: bill.dead,
    billStatus: currentStatus as DBBillStatus,
    committeeAssignment: committeeAssign ?? null,
    deadlines: SESSION_DEADLINES,
    today,
    hearingPassed: testimonyDeadline.hearingPassed,
    latestStatusText: latestUpdateText,
  });
  const testimonyUrgent =
    testimonyEligibility.allowed && isTestimonyUrgent(currentStatus as DBBillStatus);
  const hearingAt = testimonyDeadline.hearingAt;
  const testimonyCountdown = testimonyEligibility.allowed ? testimonyDeadline.countdown : null;
  const urgentTooltip = hearingAt
    ? `Hearing ${hearingAt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Submit testimony at least 24 hours before the hearing.`
    : 'Hearing scheduled! Submit testimony at least 24 hours before the hearing.';

  // Once a bill is signed into law, legislators can no longer act on it — the
  // same enacted check that closes testimony also closes Contact Legislator.
  const contactDisabled = isEnacted(currentStatus as DBBillStatus);
  const contactDisabledReason = 'This bill has become law! Legislators can no longer act on it.';

  const handleSave = async () => {
    try {
      setSaving(true);
      if (isInternInAllBillsView) {
        toast({ title: "Cannot Edit", description: "Switch to 'My Bills' to edit.", variant: "destructive" });
        return;
      }
      if (user?.role === 'user') {
        await proposeStatusChange(bill, selectedStatus as BillStatus, { userId: user.id, role: 'intern' });
        toast({ title: "Change Proposed", description: "Awaiting supervisor approval." });
        onClose();
        return;
      }
      const updatedBillFromServer = await updateBillStatus(bill.id, selectedStatus);
      if (!updatedBillFromServer) throw new Error('Failed to update');
      setBills(prev => prev.map(b => b.id === bill.id
        ? { ...b, llm_suggested: false, llm_processing: false, previous_status: b.current_bill_status, current_bill_status: selectedStatus }
        : b
      ));
      setTempBills(prev => prev.filter(tb => tb.id !== bill.id));
      toast({ title: "Status Updated", description: `Moved to ${COLUMN_TITLES[selectedStatus]}.` });
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdateRefresh = (description: string, committee_assignment: string, introducers: string, updates: StatusUpdate[]) => {
    const sorted = [...updates].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setBillDetails(prev => prev ? { ...prev, description, committee_assignment, introducers, updates: sorted } : null);
    if (bill) updateBill(bill.id, { description, latest_update: updates[0] ?? null });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[100vw] sm:max-w-7xl h-[100dvh] sm:h-[95vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-lg [&>button]:p-2 [&>button]:rounded-md sm:[&>button]:p-0 sm:[&>button]:rounded-sm">
        {/* Header — compact, with progress.
            text-left overrides DialogHeader's `text-center sm:text-left` default,
            which centered the "RELATING TO ..." title on mobile while the bill
            number beside it read as left-aligned (it sits in a flex row). */}
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b shrink-0 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* leading-none on the title so its line box matches the h-5
                  badges beside it — text-lg's default line-height made them sit
                  visually low against it. */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <DialogTitle className="text-lg font-semibold leading-none tracking-tight">
                  {bill.bill_number}
                </DialogTitle>
                {bill.dead && (
                  <Badge variant="destructive" className="text-[10px] h-5 text-white">Failed</Badge>
                )}
                {/* Badge is a DIRECT flex child, with the term trigger inside it —
                    wrapping the badge in the trigger introduced an inline,
                    baseline-aligned button that broke items-center. */}
                {fiscal && (
                  <Badge variant="secondary" className="h-5 text-[10px]">
                    <Term slug="fiscal" variant="chip" billId={bill.id} className="leading-none">
                      Fiscal
                    </Term>
                  </Badge>
                )}
                {/* One entry point for all conceptual explanation, so the
                    surrounding labels can stay unmarked and legible. */}
                <BillBreakdownButton
                  bill={billForPanels}
                  currentStatus={currentStatus}
                  deadlineName={nextDeadline?.name ?? null}
                />
              </div>
              <DialogDescription className="text-sm text-muted-foreground line-clamp-2 sm:line-clamp-1">
                {bill.bill_title}
              </DialogDescription>
            </div>
            {/* Source link — in line with the title, desktop only */}
            {billDetails?.bill_url && (
              <a
                href={billDetails.bill_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex align-middle pt-4 text-sm shrink-0 items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
              >
                <ExternalLink className="h-4 w-4" />
                View on Hawaii State Legislature
              </a>
            )}
          </div>

          {/* Tab row — sub-nav styling (light-gray pill, dark-teal active),
              matching the main header's sub-nav; source link on the right */}
          <div className="mt-3 flex items-center justify-between gap-3">
            {/* Three short labels fit at 375px with roughly 45px to spare, but the
                margin is thin enough to depend on font rendering — so the row
                scrolls horizontally rather than clipping the last tab.
                min-w-0 lets it actually shrink inside the flex parent. */}
            <nav
              aria-label="Bill views"
              className="inline-flex h-10 min-w-0 max-w-full items-center overflow-x-auto rounded-md bg-secondary p-1 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {TABS.filter((t) => !t.mobileOnly || isMobile).map(({ id, label, shortLabel, icon: Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm px-2.5 sm:px-3 py-1.5 text-sm font-medium transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
                      active
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-secondary-foreground hover:bg-white/50',
                    )}
                  >
                    <Icon className="h-4 w-4 sm:mr-2" />
                    {/* Three tabs don't fit at 375px with full labels, so mobile
                        gets the short form. The icon carries the rest. The update
                        COUNT deliberately lives only in the panel heading next to
                        Refresh, not here — showing it in both puts the same number
                        twice on one screen. */}
                    <span className="ml-1.5 sm:ml-0 sm:hidden">{shortLabel ?? label}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </nav>
            {/* Write Testimony + Contact Legislator CTAs — in line with the tabs,
                desktop only. On mobile they live in the sticky bottom action bar.
                Contact Legislator is always enabled, so it sits in this shared
                wrapper alongside whichever Write Testimony variant renders. */}
            <div className="hidden sm:flex shrink-0 items-center gap-2">
              {trackSlot}
              {!user ? (
                /* Logged-out (the dialog is reachable from public search): both
                   CTAs lead to authenticated flows, so they become login prompts
                   rather than dead buttons. The dialog stays open behind the
                   login dialog, so the reader keeps their place. */
                <>
                  <LoginDialog
                    trigger={
                      <Button size="sm" variant="outline">
                        <PenLine className="mr-1.5 h-3.5 w-3.5" />
                        Login to write a testimony
                      </Button>
                    }
                  />
                  <LoginDialog
                    trigger={
                      <Button size="sm" variant="outline">
                        <Users className="mr-1.5 h-3.5 w-3.5" />
                        Login to contact a legislator
                      </Button>
                    }
                  />
                </>
              ) : testimonyEligibility.allowed ? (
                <>
                  {testimonyUrgent && testimonyCountdown && (
                    <span className="text-xs font-medium text-red-600 whitespace-nowrap">
                      Testimony {testimonyCountdown}
                    </span>
                  )}
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="relative"
                          onClick={() => {
                            onClose();
                            router.push(`/bills/${bill.id}/testimony`);
                          }}
                        >
                          {testimonyUrgent && (
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" aria-hidden="true">
                              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-safe:animate-ping" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                            </span>
                          )}
                          <PenLine className="mr-1.5 h-3.5 w-3.5" />
                          Write Testimony
                        </Button>
                      </TooltipTrigger>
                      {testimonyUrgent && (
                        <TooltipContent>
                          <p>{urgentTooltip}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </>
              ) : (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block shrink-0 cursor-not-allowed">
                        <Button size="sm" variant="outline" disabled className="pointer-events-none">
                          <PenLine className="mr-1.5 h-3.5 w-3.5" />
                          Write Testimony
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Testimony closed! {testimonyEligibility.reason}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {user && (contactDisabled ? (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block shrink-0 cursor-not-allowed">
                        <Button size="sm" variant="outline" disabled className="pointer-events-none">
                          <Users className="mr-1.5 h-3.5 w-3.5" />
                          Contact Legislator
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{contactDisabledReason}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onClose();
                    router.push(`/bills/${bill.id}/contact`);
                  }}
                >
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  Contact Legislator
                </Button>
              ))}
            </div>
          </div>
        </DialogHeader>

        {/* Body — split layout */}
        {loadingDetails ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading bill details...</p>
            </div>
          </div>
        ) : detailsError ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-destructive">{detailsError}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => {
                if (billID) {
                  setLoadingDetails(true); setDetailsError(null);
                  getBillDetails(billID).then(setBillDetails).catch(() => setDetailsError('Failed to load')).finally(() => setLoadingDetails(false));
                }
              }}>Try Again</Button>
            </div>
          </div>
        ) : (
          (() => {
            const leftPanel = (
            <div className={cn("flex flex-col min-h-0", isMobile ? "h-full" : "w-[55%] border-r")}>
              <ScrollArea className="flex-1">
                <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">

                  {/* AI-optional briefing — derived facts render with no AI call */}
                  <BillBriefing
                    bill={billForPanels}
                    today={today}
                    dead={bill.dead}
                    deadReason={deadReason}
                    progressValue={progressValue}
                    progressStages={PROGRESS_STAGES.map(s => s.shortName)}
                    currentStageName={currentStageName}
                    onNextStep={(action) => {
                      if (action === 'diff' || action === 'reports') setActiveTab('versions');
                      else if (action === 'testimony') { onClose(); router.push(`/bills/${bill.id}/testimony`); }
                      else if (action === 'contact') { onClose(); router.push(`/bills/${bill.id}/contact`); }
                    }}
                  />

                  {/* Bill details */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Description</h3>
                      <p className="text-sm leading-relaxed">{billDetails?.description || bill.description}</p>
                    </div>

                    <div>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Introducers</h3>
                      <p className="text-sm">{billDetails?.introducer || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tags</h3>
                    <TagSelector billId={bill.id} />
                  </div>

                  {/* Tracked By */}
                  {canSeeTracking && (
                    <div>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tracked By</h3>
                      {bill.tracked_by && bill.tracked_by.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {bill.tracked_by.map((tracker) => (
                            <Badge key={tracker.id} variant="outline" className="text-xs">
                              {tracker.username || tracker.email || 'Unknown'}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No one is tracking this bill.</p>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Status change — pinned to bottom of left panel; org ADMINS only
                  (org statuses are tenant-scoped; workers and public users don't set them) */}
              {/* TEMPORARILY DISABLED: bill status change hidden
              {canChangeStatus && (
                <div className="border-t p-4 shrink-0 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Change Status</h3>
                  </div>
                  <div className="flex gap-2">
                    <Select value={selectedStatus} onValueChange={setSelectedStatus} disabled={!canEditBill}>
                      <SelectTrigger className="flex-1 h-9 text-sm">
                        <SelectValue placeholder={!canEditBill ? "Only in 'My Bills'" : "Select status"} />
                      </SelectTrigger>
                      <SelectContent>
                        {KANBAN_COLUMNS.map((col) => (
                          <SelectItem key={col.id} value={col.id} className="cursor-pointer text-sm">
                            {col.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleSave} disabled={!selectedStatus || !canEditBill} size="sm" className="px-6 h-9">
                      Save
                    </Button>
                  </div>
                </div>
              )}
              */}
            </div>
            );

            const activityPanel = (
            <div className="flex flex-col min-h-0 h-full">
              <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b shrink-0 flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status Updates
                  {billDetails?.updates && (
                    <span className="ml-1.5 text-muted-foreground/60">({billDetails.updates.length})</span>
                  )}
                </h3>
                {user && (
                  <RefreshStatusesButton bill={bill} onRefresh={handleStatusUpdateRefresh} />
                )}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 sm:p-5">
                  {billDetails?.updates && billDetails.updates.length > 0 ? (
                    <div className="space-y-3">
                      {billDetails.updates.map((update, index) => (
                        <div
                          key={`${billDetails.id}-update-${index}-${update.id || index}`}
                          className={cn(
                            "rounded-lg border p-3 text-sm transition-colors",
                            index === 0
                              ? "bg-card border-primary/20 shadow-sm"
                              : "bg-card/50 border-border/50"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            {/* A bare "H"/"S" is meaningless without context. */}
                            <Term slug="chamber" variant="chip" billId={bill.id}>
                              <Badge variant={index === 0 ? "default" : "outline"} className="text-[10px] h-4 px-1.5">
                                {update.chamber}
                              </Badge>
                            </Term>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {new Date(update.date).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric'
                              })}
                            </span>
                          </div>
                          <p className={cn(
                            "text-xs leading-relaxed",
                            index === 0 ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {update.statustext}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No status updates</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
            );

            if (isMobile) {
              return (
                <>
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col min-h-0">
                    {/* Tab switcher lives in the dialog header */}
                    {/* Status Updates is its own tab on mobile, so Overview no
                        longer stacks it below a long scroll. leftPanel is h-full
                        with its own ScrollArea and a pinned Change Status footer,
                        so this holds it to the available height (flex + min-h-0)
                        rather than letting it grow inside an outer overflow-auto —
                        which would nest two scrollers and unpin the footer. */}
                    <TabsContent value="overview" className="flex-1 min-h-0 mt-0 flex flex-col data-[state=inactive]:hidden">
                      {leftPanel}
                    </TabsContent>
                    <TabsContent value="versions" className="flex-1 min-h-0 mt-0 flex flex-col data-[state=inactive]:hidden">
                      <VersionsReportsTab billId={billID ?? ""} versions={billDetails?.versions ?? []} reports={billDetails?.reports ?? []} />
                    </TabsContent>
                    <TabsContent value="updates" className="flex-1 min-h-0 mt-0 flex flex-col data-[state=inactive]:hidden">
                      {activityPanel}
                    </TabsContent>
                  </Tabs>

                  {/* Sticky action bar — the testimony CTA in thumb reach; the
                      disabled reason is visible text (tooltips don't work on touch) */}
                  <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-1.5">
                    {/* Two CTAs share a half-width row; Track Bill sits full
                        width beneath them. The labels are shortened here because
                        at half of a 375px screen the full verbiage wraps. */}
                    {!user ? (
                      /* Logged-out: both flows require an account, so the CTAs
                         become login prompts instead of buttons that dead-end. */
                      <div className="grid grid-cols-2 gap-1.5">
                        <LoginDialog
                          trigger={
                            <Button variant="outline" className="h-11 w-full px-2">
                              <PenLine className="mr-1.5 h-4 w-4 shrink-0" />
                              <span className="truncate">Login to testify</span>
                            </Button>
                          }
                        />
                        <LoginDialog
                          trigger={
                            <Button variant="outline" className="h-11 w-full px-2">
                              <Users className="mr-1.5 h-4 w-4 shrink-0" />
                              <span className="truncate">Login to contact</span>
                            </Button>
                          }
                        />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-1.5">
                          <Button
                            variant="outline"
                            className="h-11 w-full px-2"
                            disabled={!testimonyEligibility.allowed}
                            onClick={() => {
                              onClose();
                              router.push(`/bills/${bill.id}/testimony`);
                            }}
                          >
                            <PenLine className="mr-1.5 h-4 w-4 shrink-0" />
                            <span className="truncate">Testimony</span>
                          </Button>
                          <Button
                            variant="outline"
                            className="h-11 w-full px-2"
                            disabled={contactDisabled}
                            onClick={() => {
                              onClose();
                              router.push(`/bills/${bill.id}/contact`);
                            }}
                          >
                            <Users className="mr-1.5 h-4 w-4 shrink-0" />
                            <span className="truncate">Contact</span>
                          </Button>
                        </div>
                        {testimonyEligibility.allowed && testimonyUrgent && testimonyCountdown && (
                          <p className="text-center text-xs font-medium text-red-600">
                            Testimony {testimonyCountdown}
                          </p>
                        )}
                        {!testimonyEligibility.allowed && (
                          <p className="text-center text-xs text-muted-foreground">
                            Testimony is closed! {testimonyEligibility.reason}.
                          </p>
                        )}
                        {contactDisabled && (
                          <p className="text-center text-xs text-muted-foreground">
                            {contactDisabledReason}
                          </p>
                        )}
                      </>
                    )}

                    {/* The desktop CTA row is hidden below sm:, so the track
                        control is repeated here to stay reachable. Full width,
                        below the pair — its label is forced back on because the
                        search page's button is icon-only at this breakpoint. */}
                    {trackSlot && (
                      <div className="[&_button]:h-11 [&_button]:w-full [&_button>span]:inline">
                        {trackSlot}
                      </div>
                    )}
                  </div>
                </>
              );
            }

            return (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col min-h-0">
                {/* Tab switcher lives in the dialog header */}
                <TabsContent value="overview" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
                  <div className="flex h-full min-h-0">
                    {leftPanel}
                    <div className="flex flex-col bg-muted/20 min-h-0 w-[45%]">
                      {activityPanel}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="versions" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
                  <VersionsReportsTab billId={billID ?? ""} versions={billDetails?.versions ?? []} reports={billDetails?.reports ?? []} />
                </TabsContent>
              </Tabs>
            );
          })()
        )}
      </DialogContent>
    </Dialog>
  );
}
