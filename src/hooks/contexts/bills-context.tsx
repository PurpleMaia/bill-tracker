'use client';

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import type { Bill, BillStatus, TempBill } from '@/types/legislation';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/contexts/auth-context';

interface BillsContextType {
  // State
  loadingBills: boolean;
  setLoadingBills: Dispatch<SetStateAction<boolean>>;
  bills: Bill[];
  setBills: Dispatch<SetStateAction<Bill[]>>;
  tempBills: TempBill[];
  setTempBills: Dispatch<SetStateAction<TempBill[]>>;

  // LLM Suggestion Controls
  acceptLLMChange: (billId: string) => Promise<void>;
  rejectLLMChange: (billId: string) => Promise<void>;
  rejectAllLLMChanges: () => Promise<void>;
  acceptAllLLMChanges: () => Promise<void>;

  // Human Proposal Controls
  proposeStatusChange: (
    bill: Bill,
    suggested_status: BillStatus,
    meta: { userId: string; role: 'intern' | 'supervisor' | 'admin' | 'worker'; note?: string }
  ) => Promise<void>;
  acceptTempChange: (billId: string) => Promise<void>;
  rejectTempChange: (billId: string) => Promise<void>;
  acceptAllTempChanges: () => Promise<void>;
  rejectAllTempChanges: () => Promise<void>;
  undoProposal: (billId: string) => Promise<void>;
  // updateBillNickname: (billId: string, nickname: string) => Promise<void>;

  // View Mode
  viewMode: 'my-bills' | 'all-bills';
  setViewMode: (mode: 'my-bills' | 'all-bills') => void;
  toggleViewMode: () => void;

  // Archived Toggle
  showArchived: boolean;
  setShowArchived: (show: boolean) => void;
  toggleShowArchived: () => void;

  // Bill CRUD Operations
  addBill: (bill: Bill) => void;
  updateBill: (billId: string, updates: Partial<Bill>) => void;
  removeBill: (billId: string) => void;

  // Data Operations
  resetBills: () => Promise<void>;
  refreshBills: () => Promise<void>;
}

const BillsContext = createContext<BillsContextType | undefined>(undefined);

const canCommitStatus = (orgRole?: string) =>
  orgRole === 'admin';

export function BillsProvider({ children }: { children: ReactNode }) {

  const [bills, setBills] = useState<Bill[]>([]);
  const [tempBills, setTempBills] = useState<TempBill[]>([]);
  const [, setError] = useState<string | null>(null);
  const [loadingBills, setLoadingBills] = useState(false);
  const [viewMode, setViewMode] = useState<'my-bills' | 'all-bills'>('my-bills');
  const [showArchived, setShowArchived] = useState(false);
  const { user, loading: userLoading, activeTenant } = useAuth();

  /**
   * Reloads proposals from the server and updates local state
   * @returns Array of proposals or null if failed
   */
  const reloadProposalsFromServer = useCallback(async () => {
    try {
      console.log('🔄 [SYNC] Fetching proposals from API...');

      const params = new URLSearchParams();
      if (activeTenant?.tenantId) params.set('tenantId', activeTenant.tenantId);

      const response = await fetch(`/api/proposals?${params}`);
      if (!response.ok) {
        console.error('❌ [SYNC] API response not OK:', response.status);
        return null;
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.proposals)) {
        console.log(`✅ [SYNC] Synced ${data.proposals.length} proposals from API`);
        setTempBills(data.proposals);
        return data.proposals as TempBill[];
      }

      console.warn('⚠️ [SYNC] Unexpected proposals payload:', data);
      setTempBills([]);
      return [];
    } catch (error) {
      console.error('❌ [SYNC] Error reloading proposals:', error);
      return null;
    }
  }, [activeTenant]);

  /**
   * Fetches bills and their tags based on view mode
   * @param viewModeOverride Optional view mode to use instead of current state
   */
  const fetchBillsWithTags = useCallback(async (viewModeOverride?: 'my-bills' | 'all-bills') => {
    const mode = viewModeOverride ?? viewMode;

    const params = new URLSearchParams();
    if (activeTenant?.tenantId) params.set('tenantId', activeTenant.tenantId);
    params.set('viewMode', mode);
    params.set('showArchived', String(showArchived));

    const response = await fetch(`/api/bills?${params}`);
    if (!response.ok) throw new Error('Failed to fetch bills');
    const data = await response.json();
    const results = (data.bills ?? []) as Bill[];

    console.log(`Bills fetched via API (${mode}):`, results.length);
    return results;
  }, [activeTenant, viewMode, showArchived]);

  // ---------------------------------------------------------------------------
  // SECTION 1: LLM SUGGESTION OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Accepts an LLM suggestion and commits the status change to the database
   */
  const acceptLLMChange = useCallback(async (billId: string) => {
    const bill = bills.find((b) => b.id === billId);
    if (!bill || !bill.llm_suggested) return;

    try {
      await updateBillStatus(billId, bill.current_bill_status);

      setBills((prevBills) =>
        prevBills.map((b) =>
          b.id === billId
            ? { ...b, llm_suggested: false, previous_status: undefined }
            : b
        )
      );

      setTempBills((prev) => prev.filter((tb) => tb.id !== billId));

      toast({
        title: 'Change Accepted',
        description: `${bill.bill_number} status updated to ${bill.current_bill_status}`,
        variant: 'default',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to accept the change. Please try again.',
        variant: 'destructive',
      });
    }
  }, [bills]);

  /**
   * Rejects an LLM suggestion and reverts to the previous status
   */
  const rejectLLMChange = useCallback(async (billId: string) => {
    const bill = bills.find((b) => b.id === billId);
    if (!bill || !bill.llm_suggested) return;

    setBills((prevBills: Bill[]) =>
      prevBills.map((b) =>
        b.id === billId
          ? {
              ...b,
              current_bill_status: b.previous_status!,
              llm_suggested: false,
              previous_status: undefined,
            }
          : b
      )
    );

    setTempBills((prev) => prev.filter((tb) => tb.id !== billId));

    toast({
      title: 'Change Rejected',
      description: `${bill.bill_number} reverted to ${bill?.previous_status}`,
      variant: 'default',
    });
  }, [bills]);

  /**
   * Rejects all pending LLM suggestions
   */
  const rejectAllLLMChanges = useCallback(async () => {
    const suggestedBills = bills.filter((b) => b.llm_suggested);
    for (const bill of suggestedBills) {
      await rejectLLMChange(bill.id);
    }
    toast({
      title: 'All Changes Rejected',
      description: `Rejected ${suggestedBills.length} AI suggestions`,
      variant: 'default',
    });
  }, [bills, rejectLLMChange]);

  /**
   * Accepts all pending LLM suggestions
   */
  const acceptAllLLMChanges = useCallback(async () => {
    const suggestedBills = bills.filter((b) => b.llm_suggested);
    for (const bill of suggestedBills) {
      await acceptLLMChange(bill.id);
    }
    toast({
      title: 'All Changes Accepted',
      description: `Accepted ${suggestedBills.length} AI suggestions`,
      variant: 'default',
    });
  }, [bills, acceptLLMChange]);

  // ---------------------------------------------------------------------------
  // SECTION 2: HUMAN PROPOSAL OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Creates or updates a pending proposal for a bill status change
   * Used by interns or supervisors who want review before committing
   */
  const proposeStatusChange: BillsContextType['proposeStatusChange'] = useCallback(async (
    bill,
    proposed_status,
    meta
  ) => {
    console.log('🟣 proposeStatusChange called:', bill.id, '→', proposed_status);

    // Validate required fields
    if (!bill.id) {
      throw new Error('Bill ID is missing');
    }

    const currentStatus = bill.current_bill_status?.trim() || 'unassigned';
    if (!currentStatus || currentStatus === '') {
      console.warn(`⚠️ Bill ${bill.id} has missing current_bill_status, using 'unassigned' as fallback`);
    }

    if (!proposed_status || proposed_status.trim() === '') {
      throw new Error(`Proposed status is missing or empty. Bill ID: ${bill.id}`);
    }

    const proposal: TempBill = {
      id: bill.id,
      bill_title: bill.bill_title || null,
      current_status: currentStatus as BillStatus,
      proposed_status: proposed_status as BillStatus,
      target_idx: 0,
      source: 'human',
      approval_status: 'pending',
      proposed_by: {
        user_id: meta.userId,
        role: meta.role,
        at: new Date().toISOString(),
        note: meta.note,
        username: (user?.username as string | undefined) ?? undefined,
        email: (user?.email as string | undefined) ?? undefined,
      },
    };

    try {
      const requestBody = {
        billId: bill.id,
        currentStatus: currentStatus,
        proposedStatus: proposed_status,
        note: meta.note || undefined,
        tenantId: activeTenant?.tenantId ?? undefined,
      };

      console.log('🟣 Sending proposal request:', requestBody);

      const response = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.details || errorData.error || 'Failed to save proposal';
        console.error('❌ Save proposal error:', errorMsg, errorData);
        throw new Error(errorMsg);
      }

      const proposals = await reloadProposalsFromServer();
      if (proposals === null) {
        console.error('❌ [SYNC] Falling back to local proposal update');
        setTempBills((prev) => {
          const filtered = prev.filter((tb) => tb.id !== bill.id);
          return [...filtered, proposal];
        });
      }

      // Set the bill that was changed to the new id
      updateBill(bill.id, { current_bill_status: proposed_status });

      toast({
        title: 'Change Proposed',
        description: `Pending: ${bill.bill_number} → ${proposed_status}`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error proposing change:', error);
      toast({
        title: 'Error',
        description: 'Failed to save proposal',
        variant: 'destructive',
      });
    }
  }, [user, activeTenant, reloadProposalsFromServer]);

  /**
   * Supervisor/Admin approves a single proposal
   * Commits the change to the database and updates local state
   */
  const acceptTempChange: BillsContextType['acceptTempChange'] = useCallback(async (billId) => {
    const tb = tempBills.find((t) => t.id === billId);
    if (!tb) return;

    if (!canCommitStatus(activeTenant?.orgRole)) {
      toast({
        title: 'Forbidden',
        description: 'You do not have permission to approve changes.',
        variant: 'destructive',
      });
      return;
    }

    // Check if this is an LLM suggestion
    const proposalId = (tb as any).proposalId;
    const bill = bills.find((b) => b.id === billId);
    const isLLMSuggestion = !proposalId || tb.source === 'llm' || bill?.llm_suggested;

    if (isLLMSuggestion) {
      await acceptLLMChange(billId);
      return;
    }

    try {
      const response = await fetch('/api/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, action: 'approve', tenantId: activeTenant?.tenantId }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve proposal');
      }

      setBills((prev) =>
        prev.map((b) =>
          b.id === billId
            ? {
                ...b,
                previous_status: b.current_bill_status,
                current_bill_status: tb.proposed_status as BillStatus,
                llm_suggested: false,
                llm_processing: false,
              }
            : b
        )
      );

      setTempBills((prev) => prev.filter((t) => t.id !== billId));

      const proposals = await reloadProposalsFromServer();
      if (proposals === null) {
        console.warn('⚠️ [SYNC] Unable to reload proposals after approval');
      }

      toast({
        title: 'Proposal Approved',
        description: `Bill updated to ${tb.proposed_status}`,
        variant: 'default',
      });
    } catch (e) {
      toast({
        title: 'Error',
        description: 'Failed to approve proposal.',
        variant: 'destructive',
      });
    }
  }, [tempBills, user, activeTenant, bills, acceptLLMChange, reloadProposalsFromServer]);

  /**
   * Supervisor/Admin rejects a single proposal
   * Removes the proposal from pending state
   */
  const rejectTempChange: BillsContextType['rejectTempChange'] = useCallback(async (billId) => {
    const tb = tempBills.find((t) => t.id === billId);
    if (!tb) return;

    if (!canCommitStatus(activeTenant?.orgRole)) {
      toast({
        title: 'Forbidden',
        description: 'You do not have permission to reject changes.',
        variant: 'destructive',
      });
      return;
    }

    // Check if this is an LLM suggestion
    const proposalId = (tb as any).proposalId;
    const bill = bills.find((b) => b.id === billId);
    const isLLMSuggestion = !proposalId || tb.source === 'llm' || bill?.llm_suggested;

    if (isLLMSuggestion) {
      await rejectLLMChange(billId);
      return;
    }

    try {
      const response = await fetch('/api/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, action: 'reject', tenantId: activeTenant?.tenantId }),
      });

      if (!response.ok) {
        throw new Error('Failed to reject proposal');
      }

      // Revert the bill's status back to the original status
      setBills((prev) =>
        prev.map((b) =>
          b.id === billId
            ? { ...b, current_bill_status: tb.current_status }
            : b
        )
      );

      setTempBills((prev) => prev.filter((t) => t.id !== billId));

      const proposals = await reloadProposalsFromServer();
      if (proposals === null) {
        console.warn('⚠️ [SYNC] Unable to reload proposals after rejection');
      }

      toast({
        title: 'Proposal Rejected',
        description: `Bill reverted to ${tb.current_status}`,
        variant: 'default',
      });
    } catch (e) {
      toast({
        title: 'Error',
        description: 'Failed to reject proposal.',
        variant: 'destructive',
      });
    }
  }, [tempBills, user, activeTenant, bills, rejectLLMChange, reloadProposalsFromServer]);

  /**
   * Approves all pending human proposals
   */
  const acceptAllTempChanges: BillsContextType['acceptAllTempChanges'] = useCallback(async () => {
    if (!canCommitStatus(activeTenant?.orgRole)) {
      toast({
        title: 'Forbidden',
        description: 'You do not have permission to approve changes.',
        variant: 'destructive',
      });
      return;
    }
    const humanProposals = tempBills.filter((t) => t.source === 'human');
    const ops = humanProposals.map((t) => acceptTempChange(t.id));
    await Promise.allSettled(ops);
    await reloadProposalsFromServer();
  }, [user, activeTenant, tempBills, acceptTempChange, reloadProposalsFromServer]);

  /**
   * Rejects all pending human proposals
   */
  const rejectAllTempChanges: BillsContextType['rejectAllTempChanges'] = useCallback(async () => {
    const humanProposals = tempBills.filter((t) => t.source === 'human');
    if (humanProposals.length === 0) return;
    setTempBills((prev) => prev.filter((t) => t.source !== 'human'));
    toast({
      title: 'All Proposals Rejected',
      description: `Discarded ${humanProposals.length} pending changes.`,
      variant: 'default',
    });
  }, [tempBills]);

  /**
   * Allows a user to undo/delete their own pending proposal
   * Removes the proposal from the database and reverts the bill to its original status
   */
  const undoProposal: BillsContextType['undoProposal'] = useCallback(async (billId) => {
    const tb = tempBills.find((t) => t.id === billId);
    if (!tb) {
      console.warn('No temp bill found for:', billId);
      return;
    }

    // Only allow users to undo their own proposals
    if (tb.proposed_by?.user_id !== user?.id) {
      toast({
        title: 'Forbidden',
        description: 'You can only undo your own proposals.',
        variant: 'destructive',
      });
      return;
    }

    try {
      console.log('🗑️ [UNDO] Deleting proposal for bill:', billId);

      const response = await fetch('/api/proposals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId, tenantId: activeTenant?.tenantId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete proposal');
      }

      const data = await response.json();
      console.log('✅ [UNDO] Proposal deleted successfully');

      // Revert the bill's status back to the original status
      setBills((prev) =>
        prev.map((b) =>
          b.id === billId
            ? { ...b, current_bill_status: tb.current_status }
            : b
        )
      );

      // Remove the temp bill from UI
      setTempBills((prev) => prev.filter((t) => t.id !== billId));

      toast({
        title: 'Proposal Undone',
        description: `Bill reverted to ${tb.current_status}`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error undoing proposal:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to undo proposal',
        variant: 'destructive',
      });
    }
  }, [tempBills, user, activeTenant]);

  // ---------------------------------------------------------------------------
  // SECTION 3: BILL CRUD OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Adds a new bill to the bills array
   * If bill already exists, updates it instead
   */
  const addBill = useCallback((bill: Bill) => {
    setBills((prevBills) => {
      const exists = prevBills.some(b => b.id === bill.id);
      if (exists) {
        console.warn(`Bill ${bill.id} already exists, updating instead`);
        return prevBills.map(b => b.id === bill.id ? bill : b);
      }
      return [...prevBills, bill];
    });
  }, []);

  /**
   * Updates specific fields of a bill without refreshing the entire list
   * Preserves Kanban board state (scroll position, drag state, etc.)
   */
  const updateBill = useCallback((billId: string, updates: Partial<Bill>) => {
    setBills((prevBills) =>
      prevBills.map((bill) =>
        bill.id === billId ? { ...bill, ...updates } : bill
      )
    );
  }, []);

  /**
   * Removes a bill from the bills array
   */
  const removeBill = useCallback((billId: string) => {
    setBills((prevBills) => prevBills.filter(bill => bill.id !== billId));
  }, []);

  // ---------------------------------------------------------------------------
  // SECTION 4: DATA OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Resets all bill states and clears proposals
   * Reverts any pending LLM suggestions
   */
  const resetBills = useCallback(async () => {
    setTempBills([]);
    setBills((prevBills) =>
      prevBills.map((bill) => ({
        ...bill,
        llm_processing: false,
        llm_suggested: false,
        current_bill_status: bill.previous_status || bill.current_bill_status,
        previous_status: undefined,
      }))
    );
  }, []);

  /**
   * Refreshes the bills list from the server
   * Uses batch API for efficient tag fetching
   * Does NOT clear bills during refresh to preserve Kanban board state
   */
  const refreshBills = useCallback(async () => {
    console.log('Refreshing bills...');
    setLoadingBills(true);
    setError(null);

    try {
      const billsWithTags = await fetchBillsWithTags();
      setBills(billsWithTags);
      console.log('Bills refreshed successfully:', billsWithTags.length);
    } catch (err) {
      console.error('Error refreshing bills:', err);
      setError('Failed to refresh bills.');
    } finally {
      setLoadingBills(false);
    }
  }, [fetchBillsWithTags]);

  /**
   * Toggles between 'my-bills' and 'all-bills' view modes
   * Automatically fetches the appropriate bills for the new mode
   */
  const toggleViewMode = useCallback(() => {
    if (!user) return;

    const newMode = viewMode === 'my-bills' ? 'all-bills' : 'my-bills';
    setViewMode(newMode);

    (async () => {
      setLoadingBills(true);
      try {
        const billsWithTags = await fetchBillsWithTags(newMode);
        setBills(billsWithTags);
      } catch (err) {
        console.error('Error refreshing bills on toggle:', err);
        setError('Failed to refresh bills.');
      } finally {
        setLoadingBills(false);
      }
    })();
  }, [user, viewMode, fetchBillsWithTags]);

  /**
   * Toggles between showing and hiding archived bills
   * Automatically fetches the appropriate bills for the new state
   */
  const toggleShowArchived = useCallback(() => {
    setLoadingBills(true);
    const newShowArchived = !showArchived;
    setShowArchived(newShowArchived);

    (async () => {
      try {
        const billsWithTags = await fetchBillsWithTags();
        setBills(billsWithTags);
      } catch (err) {
        console.error('Error refreshing bills on archived toggle:', err);
        setError('Failed to refresh bills.');
      } finally {
        setTimeout(() => {
          setLoadingBills(false);
        }, 500); // slight delay for better UX
      }
    })();
  }, [showArchived, fetchBillsWithTags]);

  // ---------------------------------------------------------------------------
  // SECTION 5: INITIAL DATA LOAD
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (userLoading) return;

    let cancelled = false;

    (async () => {
      setLoadingBills(true);
      setError(null);

      try {
        const billsWithTags = await fetchBillsWithTags();

        if (!cancelled) {
          setBills(billsWithTags);

          // Load proposals only for logged-in users
          if (user) {
            console.log('🔄 [INITIAL LOAD] Fetching proposals from API...');
            const proposalParams = new URLSearchParams();
            if (activeTenant?.tenantId) proposalParams.set('tenantId', activeTenant.tenantId);
            const proposalsResponse = await fetch(`/api/proposals?${proposalParams}`);
            if (proposalsResponse.ok) {
              const data = await proposalsResponse.json();
              if (data.success && data.proposals) {
                console.log('🔄 [INITIAL LOAD] Received', data.proposals.length, 'proposals from API');
                data.proposals.forEach((p: any, idx: number) => {
                  console.log(`  [${idx + 1}] Bill ID: ${p.id}, Status: ${p.current_status} → ${p.suggested_status}`);
                });
                setTempBills(data.proposals);
                console.log('✅ [INITIAL LOAD] Updated tempBills state with', data.proposals.length, 'proposals');
              } else {
                console.warn('⚠️ [INITIAL LOAD] API returned success but no proposals:', data);
              }
            } else {
              console.error('❌ [INITIAL LOAD] API response not OK:', proposalsResponse.status);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading initial bills:', err);
          setError('Failed to load bills.');
        }
      } finally {
        if (!cancelled) setLoadingBills(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, userLoading, viewMode, activeTenant, fetchBillsWithTags]);

  // ---------------------------------------------------------------------------
  // CONTEXT VALUE
  // ---------------------------------------------------------------------------

  const value = useMemo(
    () => ({
      // State
      loadingBills,
      setLoadingBills,
      bills,
      setBills,
      tempBills,
      setTempBills,

      // LLM Operations
      acceptLLMChange,
      rejectLLMChange,
      rejectAllLLMChanges,
      acceptAllLLMChanges,

      // Human Proposal Operations
      proposeStatusChange,
      acceptTempChange,
      rejectTempChange,
      acceptAllTempChanges,
      rejectAllTempChanges,
      undoProposal,
      // updateBillNickname,

      // View Mode
      viewMode,
      setViewMode,
      toggleViewMode,

      // Archived Toggle
      showArchived,
      setShowArchived,
      toggleShowArchived,

      // Bill CRUD
      addBill,
      updateBill,
      removeBill,

      // Data Operations
      resetBills,
      refreshBills,
    }),
    [
      bills,
      loadingBills,
      tempBills,
      acceptLLMChange,
      acceptAllLLMChanges,
      rejectLLMChange,
      rejectAllLLMChanges,
      proposeStatusChange,
      acceptTempChange,
      rejectTempChange,
      acceptAllTempChanges,
      rejectAllTempChanges,
      undoProposal,
      // updateBillNickname,
      viewMode,
      setViewMode,
      toggleViewMode,
      showArchived,
      setShowArchived,
      toggleShowArchived,
      addBill,
      updateBill,
      removeBill,
      resetBills,
      refreshBills,
    ]
  );

  return (
    <BillsContext.Provider value={value}>{children}</BillsContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to access the Bills context
 * Must be used within a BillsProvider
 */
export function useBills() {
  const context = useContext(BillsContext);
  if (context === undefined) {
    throw new Error('useBills must be used within a BillsProvider');
  }
  return context;
}
