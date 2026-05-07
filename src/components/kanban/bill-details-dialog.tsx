'use client';

import React, { useEffect } from 'react';
import type { Bill, BillStatus, BillDetails, StatusUpdate } from '@/types/legislation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { FileText, RefreshCw, WandSparkles, Lock, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMemo, useState } from 'react';
import AIUpdateSingleButton from '../llm/llm-update-single-button';
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
import { updateBillStatus, updateBillDeadFlag, getBillDetails } from '@/services/data/legislation';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { TagSelector } from '../tags/tag-selector';
import { useTrackedBills } from '@/hooks/use-tracked-bills';

interface BillDetailsDialogProps {
  billID: string | null;
  isOpen: boolean;
  onClose: () => void;
}

// --- Progress Tracker ---
// Define the stages and their corresponding statuses
const PROGRESS_STAGES = [
  { name: 'Introduced', statuses: ['introduced'] },
  { name: 'Orig. Chamber', statuses: ['scheduled1', 'deferred1', 'waiting2', 'scheduled2', 'deferred2', 'waiting3', 'scheduled3', 'deferred3', 'crossoverWaiting1'] },
  { name: 'Non-Orig. Chamber', statuses: ['crossoverScheduled1', 'crossoverDeferred1', 'crossoverWaiting2', 'crossoverScheduled2', 'crossoverDeferred2', 'crossoverWaiting3', 'crossoverScheduled3', 'crossoverDeferred3', 'passedCommittees'] },
  { name: 'Conference', statuses: ['conferenceAssigned', 'conferenceScheduled', 'conferenceDeferred', 'conferencePassed'] },
  { name: 'Governor', statuses: ['transmittedGovernor', 'vetoList'] },
  { name: 'Law', statuses: ['governorSigns', 'lawWithoutSignature'] },
];

const getProgressValue = (status: BillStatus): number => {
  const currentStageIndex = PROGRESS_STAGES.findIndex(stage => stage.statuses.includes(status));
  // If status not found in defined stages, assume introductory phase (or handle as error)
  if (currentStageIndex === -1) {
      if (status === 'introduced') return (1 / (PROGRESS_STAGES.length + 1)) * 100; // ~14% if just introduced
      return 0; // Default or error state
  }
  // Calculate progress based on the index of the *completed* stage
  // Since index is 0-based, add 1, and add 1 again because 'Introduced' is the first *step*
  const completedStages = currentStageIndex + 1;
  // Add 1 to length for the 'Introduced' step before the first chamber
  return (completedStages / PROGRESS_STAGES.length) * 100;
};

const getCurrentStageName = (status: BillStatus): string => {
    const currentStage = PROGRESS_STAGES.find(stage => stage.statuses.includes(status));
    if (currentStage) return currentStage.name;
    if (status === 'introduced') return 'Introduced';
    return 'Not Assigned'; // Fallback
}

export function BillDetailsDialog({ billID, isOpen, onClose }: BillDetailsDialogProps) {
  const { bills, setBills, setTempBills, proposeStatusChange, updateBill, viewMode } = useBills()
  const { user } = useAuth()
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [, setSaving] = useState<boolean>(false)
  const [billDetails, setBillDetails] = useState<BillDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  // Find the basic bill data from context (for card info)
  const bill = useMemo(() => {
    const found = bills.find(b => b.id === billID)
    return found
  }, [bills, billID])

  // Fetch detailed bill data when dialog opens
  useEffect(() => {
    if (isOpen && billID) {
      setLoadingDetails(true)
      setDetailsError(null)

      getBillDetails(billID)
        .then((details) => {
          if (details.updates) {
            details.updates = [...details.updates].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          }
          setBillDetails(details)
          setSelectedStatus(details.current_bill_status || '')
        })
        .catch((error) => {
          console.error('Failed to fetch bill details:', error)
          setDetailsError('Failed to load bill details')
          toast({
            title: 'Error',
            description: 'Failed to load bill details. Please try again.',
            variant: 'destructive',
          })
        })
        .finally(() => {
          setLoadingDetails(false)
        })
    }
  }, [isOpen, billID])

  // Clear state when dialog closes
  useEffect(() => {
      if (!isOpen) {
          setSelectedStatus('')
          setBillDetails(null)
          setDetailsError(null)
      }
  }, [isOpen])


  if (!bill) {
    return null; // Don't render anything if no bill is selected
  }
  // Use billDetails for status if available, otherwise fall back to bill
  const currentStatus = billDetails?.current_bill_status || bill.current_bill_status
  const progressValue = getProgressValue(currentStatus as BillStatus);
  const currentStageName = getCurrentStageName(currentStatus as BillStatus);

  const handleOnValueChange = (status: string) => {
    setSelectedStatus(status)
  }

  // Check if editing should be disabled for interns in "All Bills" view
  const isInternInAllBillsView = user?.role === 'user' && viewMode === 'all-bills';
  
  // Interns can only edit bills in "My Bills" view (not in "All Bills" view)
  const canEditBill = !isInternInAllBillsView;
  const canSeeTracking = user?.role === 'admin' || user?.role === 'supervisor';

  const handleSave = async () => {
    try {
        setSaving(true);

        // If intern is in "All Bills" view, prevent editing
        if (isInternInAllBillsView) {
          toast({
            title: "Cannot Edit",
            description: "You can only edit bills in your 'My Bills' view. Switch to 'My Bills' to edit this bill.",
            variant: "destructive",
          });
          return;
        }

        // Interns (users with role 'user') propose changes instead of directly updating
        if (user?.role === 'user') {
          console.log('🔵 [DIALOG] User proposing change:', bill.id, '→', selectedStatus);
          await proposeStatusChange(bill, selectedStatus as BillStatus, {
            userId: user.id,
            role: 'intern',
          });
          toast({
            title: "Change Proposed",
            description: `Awaiting supervisor approval.`,
          });
          onClose();
          return;
        }

        // Admins and supervisors can directly update
        const updatedBillFromServer = await updateBillStatus(bill.id, selectedStatus);
        if (!updatedBillFromServer) {
            throw new Error('Failed to update bill status on server.');
        }

        // Update the UI bill
        setBills(prevBills => 
            prevBills.map(b => 
            b.id === bill.id 
                ? { 
                    ...b, 
                    llm_suggested: false,
                    llm_processing: false,
                    previous_status: b.current_bill_status, // Store original status
                    current_bill_status: selectedStatus,                        
                }
                : b
            )
        );

        // Remove the corresponding temp bill
        setTempBills(prevTempBills => 
          prevTempBills.filter(tb => tb.id !== bill.id)
        );

        toast({
          title: "Bill Status Updated",
          description: `${bill.bill_title} moved to ${COLUMN_TITLES[selectedStatus]}.`,
        });
        
        onClose()
    } catch (error) {
        console.error("Failed to update bill status:", error);
        toast({
          title: "Error",
          description: "Failed to update bill status. Please try again.",
          variant: "destructive",
        });
    } finally {
        setSaving(false)
    }         
  }

  const handleStatusUpdateRefresh = (description: string, committee_assignment: string, introducers: string, updates: StatusUpdate[]) => {
    const sortedUpdates = [...updates].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const updatedDetails = billDetails ? { ...billDetails, description, committee_assignment, introducers, updates: sortedUpdates } : null;

    setBillDetails(updatedDetails);
    if (bill) {
      updateBill(bill.id, { 
        description, latest_update: updates[0] ?? null 
      });
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0"> {/* Larger, full height, flex-col ensures footer is at bottom */}
        {/* Header */}
        <DialogHeader className="p-4 border-b sticky top-0 bg-background z-10">
            <div className="flex justify-between items-start">
                <div>
                    <DialogTitle className="text-lg font-semibold">{bill.bill_number} - {bill.bill_title}</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                        Current Stage: {currentStageName}
                    </DialogDescription>
                </div>
                 {/* The 'X' close button is part of DialogContent by default */}
            </div>

          {/* Progress Tracker */}
          <div className="mt-2">
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                         <Progress value={progressValue} className="w-full h-2" />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{currentStageName} ({Math.round(progressValue)}%)</p>
                    </TooltipContent>
                 </Tooltip>
            </TooltipProvider>
            <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1">
              <span>Introduced</span>
              <span>Orig. Chamber</span>
              <span>Non-Orig. Chamber</span>
              <span>Conference</span>
              <span>Governor</span>
              <span>Law</span>
            </div>
          </div>
        </DialogHeader>

        {/* Main Content Area (Scrollable) */}
        <ScrollArea className="flex-1 overflow-y-auto"> {/* flex-1 allows this area to grow and push footer down */}
          {loadingDetails ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading bill details...</p>
              </div>
            </div>
          ) : detailsError ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <p className="text-sm text-destructive">{detailsError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    if (billID) {
                      setLoadingDetails(true)
                      setDetailsError(null)
                      getBillDetails(billID)
                        .then(setBillDetails)
                        .catch((error) => {
                          setDetailsError('Failed to load bill details')
                        })
                        .finally(() => setLoadingDetails(false))
                    }
                  }}
                >
                  Try Again
                </Button>
              </div>
            </div>
          ) : (
          <div className="space-y-6 p-6">
            {/* Bill Information Section - Priority 1 */}
            <section className="rounded-lg border bg-card p-6 shadow-sm">
              <h3 className="text-sm font-semibold mb-4">Bill Information</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DetailItem label="Bill Number" value={billDetails?.bill_number || bill.bill_number} />
                  <DetailItem label="Year Introduced" value={billDetails?.year?.toString() || bill.year?.toString() || 'N/A'} />
                </div>

                <DetailItem label="Bill Title" value={billDetails?.bill_title || bill.bill_title} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DetailItem label="Committee Assignment" value={billDetails?.committee_assignment || 'Not Assigned'} />
                  <DetailItem label="Introducers" value={billDetails?.introducer || 'N/A'} />
                </div>

                {/* Dead Flag Toggle - Admins/Supervisors only */}
                {canSeeTracking && (
                  <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
                    <div className="space-y-0.5">
                      <span className="font-medium text-sm">Dead Bill</span>
                      <p className="text-xs text-muted-foreground">
                        {bill.dead ? 'This bill has been flagged as dead by the algorithm.' : 'This bill is active.'}
                      </p>
                    </div>
                    <Switch
                      checked={bill.dead}
                      onCheckedChange={async (checked) => {
                        try {
                          await updateBillDeadFlag(bill.id, checked);
                          updateBill(bill.id, { dead: checked });
                          toast({
                            title: checked ? 'Bill Marked Dead' : 'Bill Marked Alive',
                            description: `${bill.bill_number} has been ${checked ? 'flagged as dead' : 'restored to active'}.`,
                          });
                        } catch {
                          toast({
                            title: 'Error',
                            description: 'Failed to update dead flag.',
                            variant: 'destructive',
                          });
                        }
                      }}
                    />
                  </div>
                )}

                <DetailItem label="Description" value={billDetails?.description || bill.description || 'No description available.'} />

                {billDetails?.bill_url && (
                  <div>
                    <span className="font-medium">Bill URL:</span>{' '}
                    <a href={billDetails.bill_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline">
                      <FileText className="h-4 w-4" />
                      View on Hawaii State Legislature
                    </a>
                  </div>
                )}
              </div>
            </section>

            {/* Status Updates Section - Priority 2 */}
            <section className="rounded-lg border bg-card p-6 shadow-sm">
              <h3 className="text-sm font-semibold mb-4">Status Updates</h3>
              {billDetails?.updates && billDetails.updates.length > 0 ? (
                <div className="relative max-h-96 overflow-y-auto pr-2">
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border"></div>

                  {billDetails.updates.map((update, index) => (
                    <div key={`${billDetails.id}-update-${index}-${update.id || index}`} className="relative flex gap-4 mb-4 last:mb-0">
                      <div className="relative z-10 flex-shrink-0 w-12 h-12 flex items-center justify-center">
                        {index === 0 ? (
                          <div className="w-5 h-5 bg-green-500 border-4 border-green-200 rounded-full shadow-lg"></div>
                        ) : (
                          <div className="w-4 h-4 bg-gray-300 border-2 border-gray-200 rounded-full opacity-60"></div>
                        )}
                      </div>
                      <div className="flex-1 bg-muted/50 rounded-lg p-4 border">
                        <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {update.chamber}
                          </Badge>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(update.date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed break-words">
                          {update.statustext}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No status updates available</p>
                </div>
              )}
            </section>

            {/* Tags and Tracking Section - Priority 3 */}
            <section className="rounded-lg border bg-card p-6 shadow-sm">
              <h3 className="text-sm font-semibold mb-4">Tags & Tracking</h3>
              <div className="space-y-6">
                {/* Tags */}
                <div>
                  <h4 className="font-medium text-sm mb-2">Tags</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Add tags to categorize this bill.
                  </p>
                  <TagSelector billId={bill.id} />
                </div>

                {/* Tracked By */}
                {canSeeTracking && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Tracked By</h4>
                    {bill.tracked_by && bill.tracked_by.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
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
            </section>
          </div>
          )}
        </ScrollArea>
        {/* Status Change Section - Now conditionally editable */}
        <div className="border-t bg-background p-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold">Change Bill Status</h3>
            {!user && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                <span>Login required to edit</span>
              </div>
            )}
          </div>

          <div className='flex gap-3'>
            <Select
              value={selectedStatus}
              onValueChange={handleOnValueChange}
              disabled={!user || !canEditBill}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={
                  !user
                    ? "Login to edit status"
                    : !canEditBill
                      ? "Only editable in 'My Bills' view"
                      : "Select a new status"
                } />
              </SelectTrigger>
              <SelectContent>
                {KANBAN_COLUMNS.map((column) => (
                  <SelectItem key={column.id} value={column.id} className='cursor-pointer hover:bg-slate-100'>
                    {column.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={handleSave}
              disabled={!user || !selectedStatus || !canEditBill}
              className="px-8"
            >
              Save
            </Button>
          </div>
        </div>

        {/* Footer - Also conditionally show admin buttons */}
        <DialogFooter className="p-6 border-t bg-background sm:justify-between items-center">
          <div className='flex gap-2 items-center'>
            {user ? (
              <>
                <AIUpdateSingleButton bill={bill} />
                <RefreshStatusesButton bill={bill} onRefresh={handleStatusUpdateRefresh} />
              </>
            ) : (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" />
                <span>Admin features require login</span>
              </div>
            )}
          </div>
          <Button variant="outline" onClick={onClose} className="min-w-[100px]">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper component for displaying details
interface DetailItemProps {
    label: string;
    value: string;
    badge?: boolean;
}
const DetailItem: React.FC<DetailItemProps> = ({ label, value, badge }) => (
    <div className="space-y-1">
        <span className="font-medium text-sm">{label}:</span>
        <div className="text-sm">
          {label === 'Bill URL' ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline break-all hover:text-blue-800"
            >
              {checkURL(value)}
            </a>
          ) : badge ? (
            <Badge variant="secondary">{value}</Badge>
          ) : (
            <p className="text-muted-foreground break-words whitespace-normal">{value}</p>
          )}
        </div>
    </div>
);

function checkURL(url: string){
  // extracting href from the html incase it is not caught on server-side
  if (url.startsWith('<a')) {
    const match = url.match(/href=(["']?)([^"'\s>]+)\1/);
    const editedURL = match ? match[2] : null;
    console.log('Had to convert:', url)
    return editedURL
  } else {
    return url
  }
}
