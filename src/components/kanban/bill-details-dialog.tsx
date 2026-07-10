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
import { Progress } from "@/components/ui/progress";
import { cn, todayHawaii } from '@/lib/utils';
import { FileText, Loader2, ExternalLink, Clock, PenLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMemo, useState } from 'react';
import RefreshStatusesButton from '../scraper/scrape-updates-button';
import { useBills } from '@/hooks/contexts/bills-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { COLUMN_TITLES, KANBAN_COLUMNS } from '@/lib/kanban-columns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import { updateBillStatus, updateBillDeadFlag } from '@/db/queries/bills-write';
import { getBillDetails } from '@/db/queries/bills-read';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { TagSelector } from '../tags/tag-selector';
import { BillBriefing } from './bill-briefing';
import { CommitteeContacts } from './committee-contacts';
import { VersionsReportsTab } from './versions-reports-tab';
import { isBillDead, getNextDeadline, isFiscalBill } from '@/lib/dead-bill';
import type { SessionDeadlines } from '@/lib/dead-bill';
import { getTestimonyEligibility, isTestimonyUrgent } from '@/lib/testimony-eligibility';
import { parseHearingDatetime, getTestimonyCountdownLabel } from '@/lib/hearing-schedule';
import type { BillStatus as DBBillStatus } from '@/db/types';
// Real calendar for deriving why a bill already failed (historical fact);
// switchable calendar for upcoming-deadline displays (demo-aware).
import deadlinesJson from '@/data/session-deadlines-2026.json';
import type { BoardMode } from '@/lib/board-display';
import { SESSION_DEADLINES } from '@/lib/session-deadlines';

interface BillDetailsDialogProps {
  billID: string | null;
  isOpen: boolean;
  onClose: () => void;
  boardMode?: BoardMode;
}

const PROGRESS_STAGES = [
  { name: 'Introduced', statuses: ['introduced'] },
  { name: 'Orig. Chamber', statuses: ['scheduled1', 'deferred1', 'waiting2', 'scheduled2', 'deferred2', 'waiting3', 'scheduled3', 'deferred3', 'crossoverWaiting1'] },
  { name: 'Non-Orig. Chamber', statuses: ['crossoverScheduled1', 'crossoverDeferred1', 'crossoverWaiting2', 'crossoverScheduled2', 'crossoverDeferred2', 'crossoverWaiting3', 'crossoverScheduled3', 'crossoverDeferred3', 'passedCommittees'] },
  { name: 'Conference', statuses: ['conferenceAssigned', 'conferenceScheduled', 'conferenceDeferred', 'conferencePassed'] },
  { name: 'Governor', statuses: ['transmittedGovernor', 'vetoList'] },
  { name: 'Law', statuses: ['governorSigns', 'lawWithoutSignature'] },
];

const getProgressValue = (status: BillStatus): number => {
  const idx = PROGRESS_STAGES.findIndex(s => s.statuses.includes(status));
  if (idx === -1) return status === 'introduced' ? (1 / (PROGRESS_STAGES.length + 1)) * 100 : 0;
  return ((idx + 1) / PROGRESS_STAGES.length) * 100;
};

const getCurrentStageName = (status: BillStatus): string => {
  const stage = PROGRESS_STAGES.find(s => s.statuses.includes(status));
  if (stage) return stage.name;
  if (status === 'introduced') return 'Introduced';
  return 'Not Assigned';
};

export function BillDetailsDialog({ billID, isOpen, onClose, boardMode = 'own' }: BillDetailsDialogProps) {
  const { bills, setBills, setTempBills, proposeStatusChange, updateBill, viewMode } = useBills();
  const { user, activeTenant } = useAuth();
  const isMobile = useIsMobile();
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [, setSaving] = useState<boolean>(false);
  const [billDetails, setBillDetails] = useState<BillDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'versions'>('overview');

  const bill = useMemo(() => bills.find(b => b.id === billID), [bills, billID]);

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
    if (!isOpen) { setSelectedStatus(''); setBillDetails(null); setDetailsError(null); }
  }, [isOpen]);

  if (!bill) return null;

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
        deadlinesJson as SessionDeadlines,
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

  const deadlineDaysAway = nextDeadline
    ? Math.ceil((new Date(nextDeadline.date + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isUrgent = deadlineDaysAway !== null && deadlineDaysAway <= 7;
  const fiscal = committeeAssign ? isFiscalBill(committeeAssign) : false;

  const testimonyEligibility = getTestimonyEligibility({
    dead: bill.dead,
    billStatus: currentStatus as DBBillStatus,
    committeeAssignment: committeeAssign ?? null,
    deadlines: SESSION_DEADLINES,
    today,
  });
  const testimonyUrgent =
    testimonyEligibility.allowed && isTestimonyUrgent(currentStatus as DBBillStatus);
  const latestUpdateText =
    billDetails?.updates?.[0]?.statustext ?? bill.latest_update?.statustext ?? null;
  const hearingAt =
    testimonyUrgent && latestUpdateText ? parseHearingDatetime(latestUpdateText) : null;
  const testimonyCountdown = hearingAt ? getTestimonyCountdownLabel(hearingAt, new Date()) : null;
  const urgentTooltip = hearingAt
    ? `Hearing ${hearingAt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Submit testimony at least 24 hours before the hearing.`
    : 'Hearing scheduled — submit testimony at least 24 hours before the hearing.';

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
        {/* Header — compact, with progress */}
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  {bill.bill_number}
                </DialogTitle>
                {bill.dead && (
                  <Badge variant="destructive" className="text-[10px] h-5 text-white">Failed</Badge>
                )}
                {fiscal && (
                  <Badge variant="secondary" className="text-[10px] h-5">Fiscal</Badge>
                )}
              </div>
              <DialogDescription className="text-sm text-muted-foreground line-clamp-2 sm:line-clamp-1">
                {bill.bill_title}
              </DialogDescription>
            </div>
            {/* Desktop only — on mobile the testimony CTA lives in the sticky
                bottom action bar where the thumb can reach it */}
            {testimonyEligibility.allowed ? (
              <div className="hidden sm:flex shrink-0 items-center gap-2">
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
              </div>
            ) : (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="hidden sm:inline-block shrink-0 cursor-not-allowed">
                      <Button size="sm" variant="outline" disabled className="pointer-events-none">
                        <PenLine className="mr-1.5 h-3.5 w-3.5" />
                        Write Testimony
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{testimonyEligibility.reason} — testimony is closed.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Progress value={progressValue} className="w-full h-1.5" />
                </TooltipTrigger>
                <TooltipContent><p>{currentStageName} ({Math.round(progressValue)}%)</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Full stage labels on desktop; single current-stage label on mobile */}
            <div className="hidden sm:flex justify-between text-[10px] text-muted-foreground mt-1">
              {PROGRESS_STAGES.map(s => <span key={s.name}>{s.name}</span>)}
            </div>
            <div className="sm:hidden text-[10px] text-muted-foreground mt-1">
              {currentStageName}
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
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">

                  {/* AI-optional briefing — derived facts render with no AI call */}
                  <BillBriefing
                    bill={billDetails ?? (bill as BillDetails)}
                    today={today}
                    onNextStep={(action) => {
                      if (action === 'diff' || action === 'reports') setActiveTab('versions');
                      else if (action === 'testimony') { onClose(); router.push(`/bills/${bill.id}/testimony`); }
                    }}
                  />

                  {/* Dead / Deadline alert */}
                  {bill.dead ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-red-700">Bill Failed</span>
                          </div>
                          {deadReason && (
                            <p className="text-xs text-red-600">{deadReason}</p>
                          )}
                        </div>
                        {canSeeTracking && (
                          <Switch
                            checked={bill.dead}
                            onCheckedChange={async (checked) => {
                              try {
                                await updateBillDeadFlag(bill.id, checked);
                                updateBill(bill.id, { dead: checked });
                                toast({
                                  title: checked ? 'Marked Failed' : 'Marked Active',
                                  description: `${bill.bill_number} updated.`,
                                });
                              } catch {
                                toast({ title: 'Error', description: 'Failed to update.', variant: 'destructive' });
                              }
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ) : nextDeadline ? (
                    <div className={cn(
                      "rounded-lg border p-4",
                      isUrgent ? "border-amber-300 bg-amber-50" : "border-blue-200 bg-blue-50/50"
                    )}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Clock className={cn("h-3.5 w-3.5", isUrgent ? "text-amber-600" : "text-blue-600")} />
                            <span className={cn("font-medium text-sm", isUrgent ? "text-amber-700" : "text-blue-700")}>
                              {nextDeadline.name}
                            </span>
                          </div>
                          <p className={cn("text-xs", isUrgent ? "text-amber-600" : "text-blue-600")}>
                            {new Date(nextDeadline.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            {deadlineDaysAway !== null && (
                              deadlineDaysAway > 0 ? ` — ${deadlineDaysAway} day${deadlineDaysAway !== 1 ? 's' : ''} away`
                                : deadlineDaysAway === 0 ? ' — today' : ''
                            )}
                          </p>
                        </div>
                        {canSeeTracking && (
                          <Switch
                            checked={bill.dead}
                            onCheckedChange={async (checked) => {
                              try {
                                await updateBillDeadFlag(bill.id, checked);
                                updateBill(bill.id, { dead: checked });
                                toast({ title: checked ? 'Marked Failed' : 'Marked Active', description: `${bill.bill_number} updated.` });
                              } catch {
                                toast({ title: 'Error', description: 'Failed to update.', variant: 'destructive' });
                              }
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Bill details grid */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Description</h3>
                      <p className="text-sm leading-relaxed">{billDetails?.description || bill.description}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Committees</h3>
                        <p className="text-sm">{billDetails?.committee_assignment || bill.committee_assignment || 'Not Assigned'}</p>
                      </div>
                      <div>
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Introducers</h3>
                        <p className="text-sm">{billDetails?.introducer || 'N/A'}</p>
                      </div>
                    </div>

                    {billDetails?.bill_url && (
                      <a
                        href={billDetails.bill_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View on Hawaii State Legislature
                      </a>
                    )}
                  </div>

                  {/* Tags */}
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tags</h3>
                    <TagSelector billId={bill.id} />
                  </div>

                  {/* Committees */}
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Committees</h3>
                    <CommitteeContacts bill={billDetails ?? (bill as BillDetails)} />
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
                            <Badge variant={index === 0 ? "default" : "outline"} className="text-[10px] h-4 px-1.5">
                              {update.chamber}
                            </Badge>
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
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'versions')} className="flex-1 flex flex-col min-h-0">
                    <TabsList className="mx-4 mt-3 shrink-0 grid grid-cols-2">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="versions">Versions &amp; Reports</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden overflow-auto">
                      <div className="flex flex-col">
                        {leftPanel}
                        {activityPanel}
                      </div>
                    </TabsContent>
                    <TabsContent value="versions" className="flex-1 min-h-0 mt-2 flex flex-col data-[state=inactive]:hidden">
                      <VersionsReportsTab versions={billDetails?.versions ?? []} reports={billDetails?.reports ?? []} />
                    </TabsContent>
                  </Tabs>

                  {/* Sticky action bar — the testimony CTA in thumb reach; the
                      disabled reason is visible text (tooltips don't work on touch) */}
                  <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-1.5">
                    <Button
                      className="w-full h-11"
                      disabled={!testimonyEligibility.allowed}
                      onClick={() => {
                        onClose();
                        router.push(`/bills/${bill.id}/testimony`);
                      }}
                    >
                      <PenLine className="mr-2 h-4 w-4" />
                      Write Testimony
                    </Button>
                    {testimonyEligibility.allowed && testimonyUrgent && testimonyCountdown && (
                      <p className="text-center text-xs font-medium text-red-600">
                        Testimony {testimonyCountdown}
                      </p>
                    )}
                    {!testimonyEligibility.allowed && (
                      <p className="text-center text-xs text-muted-foreground">
                        {testimonyEligibility.reason} — testimony is closed.
                      </p>
                    )}
                  </div>
                </>
              );
            }

            return (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'versions')} className="flex-1 flex flex-col min-h-0">
                <TabsList className="mx-6 mt-3 w-fit shrink-0">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="versions">Versions &amp; Reports</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
                  <div className="flex h-full min-h-0">
                    {leftPanel}
                    <div className="flex flex-col bg-muted/20 min-h-0 w-[45%]">
                      {activityPanel}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="versions" className="flex-1 min-h-0 mt-2 data-[state=inactive]:hidden">
                  <VersionsReportsTab versions={billDetails?.versions ?? []} reports={billDetails?.reports ?? []} />
                </TabsContent>
              </Tabs>
            );
          })()
        )}
      </DialogContent>
    </Dialog>
  );
}
