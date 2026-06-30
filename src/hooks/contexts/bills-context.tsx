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
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';
import { useBillCrud } from '@/hooks/bills/use-bill-crud';
import { useLlmSuggestions } from '@/hooks/bills/use-llm-suggestions';
import { useHumanProposals } from '@/hooks/bills/use-human-proposals';

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
      const proposals = await data.proposals.list({ tenantId: activeTenant?.tenantId });
      setTempBills(proposals);
      return proposals;
    } catch (error) {
      console.error('❌ [SYNC] Error reloading proposals:', error);
      return null;
    }
  }, [activeTenant]);

  /**
   * Fetches bills and their tags based on view mode
   * @param viewModeOverride Optional view mode to use instead of current state
   * @param showArchivedOverride Optional archived flag to use instead of current state
   */
  const fetchBillsWithTags = useCallback(async (viewModeOverride?: 'my-bills' | 'all-bills', showArchivedOverride?: boolean) => {
    const mode = viewModeOverride ?? viewMode;
    const archived = showArchivedOverride ?? showArchived;

    const results = await data.bills.getBills({
      tenantId: activeTenant?.tenantId,
      viewMode: mode,
      showArchived: archived,
    });

    console.log(`Bills fetched (${mode}):`, results.length);
    return results;
  }, [activeTenant, viewMode, showArchived]);

  // ---------------------------------------------------------------------------
  // OPERATION GROUPS (extracted to hooks/bills/*)
  // ---------------------------------------------------------------------------
  // The bill/proposal operations live in focused hooks that receive the shared
  // state + setters. Order matters: CRUD and LLM have no cross-deps; human
  // proposals depend on both plus reloadProposalsFromServer.

  const { addBill, updateBill, removeBill } = useBillCrud({ setBills });

  const {
    acceptLLMChange,
    rejectLLMChange,
    rejectAllLLMChanges,
    acceptAllLLMChanges,
  } = useLlmSuggestions({ bills, setBills, setTempBills, activeTenant });

  const {
    proposeStatusChange,
    acceptTempChange,
    rejectTempChange,
    acceptAllTempChanges,
    rejectAllTempChanges,
    undoProposal,
  } = useHumanProposals({
    bills,
    tempBills,
    setBills,
    setTempBills,
    user,
    activeTenant,
    acceptLLMChange,
    rejectLLMChange,
    updateBill,
    reloadProposalsFromServer,
  });

  // ---------------------------------------------------------------------------
  // DATA OPERATIONS
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
        const billsWithTags = await fetchBillsWithTags(undefined, newShowArchived);
        setBills(billsWithTags);
      } catch (err) {
        console.error('Error refreshing bills on archived toggle:', err);
        setError('Failed to refresh bills.');
      } finally {
        setTimeout(() => {
          setLoadingBills(false);
        }, 500);
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
      setBills([]);
      setTempBills([]);
      setLoadingBills(true);
      setError(null);

      try {
        const billsWithTags = await fetchBillsWithTags();

        if (!cancelled) {
          setBills(billsWithTags);

          // Load proposals only for logged-in users
          if (user) {
            try {
              const proposals = await data.proposals.list({ tenantId: activeTenant?.tenantId });
              if (!cancelled) setTempBills(proposals);
            } catch (err) {
              console.error('❌ [INITIAL LOAD] Failed to load proposals:', err);
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
