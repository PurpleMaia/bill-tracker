'use client';

import { useCallback, Dispatch, SetStateAction } from 'react';
import type { Bill, BillStatus, TempBill } from '@/types/legislation';
import { toast } from '@/hooks/use-toast';
import { canCommitStatus } from '@/lib/permissions';
import { data } from '@/lib/data-client';

interface ActiveTenant {
  tenantId?: string;
  orgRole?: string;
}

interface SessionUser {
  id?: string;
  username?: string;
  email?: string;
}

interface Params {
  bills: Bill[];
  tempBills: TempBill[];
  setBills: Dispatch<SetStateAction<Bill[]>>;
  setTempBills: Dispatch<SetStateAction<TempBill[]>>;
  user: SessionUser | null | undefined;
  activeTenant: ActiveTenant | null | undefined;
  // cross-hook collaborators
  acceptLLMChange: (billId: string) => Promise<void>;
  rejectLLMChange: (billId: string) => Promise<void>;
  updateBill: (billId: string, updates: Partial<Bill>) => void;
  reloadProposalsFromServer: () => Promise<TempBill[] | null>;
}

type ProposeStatusChange = (
  bill: Bill,
  suggested_status: BillStatus,
  meta: { userId: string; role: 'intern' | 'supervisor' | 'admin' | 'worker'; note?: string }
) => Promise<void>;

/**
 * Human-proposal controls (propose / approve / reject / undo, singly and in
 * bulk). Extracted from bills-context (SECTION 2). LLM-sourced temp bills are
 * delegated to the LLM-suggestion handlers; human proposals go through the
 * data-client proposals API.
 */
export function useHumanProposals({
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
}: Params) {
  /**
   * Creates or updates a pending proposal for a bill status change.
   * Used by interns or supervisors who want review before committing.
   */
  const proposeStatusChange: ProposeStatusChange = useCallback(async (
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
      await data.proposals.create({
        billId: bill.id,
        currentStatus,
        proposedStatus: proposed_status,
        note: meta.note || undefined,
        tenantId: activeTenant?.tenantId ?? undefined,
      });

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
  }, [user, activeTenant, reloadProposalsFromServer, setTempBills, updateBill]);

  /**
   * Supervisor/Admin approves a single proposal.
   * Commits the change to the database and updates local state.
   */
  const acceptTempChange = useCallback(async (billId: string) => {
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
      await data.proposals.decide({ proposalId, action: 'approve', tenantId: activeTenant?.tenantId });

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
  }, [tempBills, activeTenant, bills, acceptLLMChange, reloadProposalsFromServer, setBills, setTempBills]);

  /**
   * Supervisor/Admin rejects a single proposal.
   * Removes the proposal from pending state.
   */
  const rejectTempChange = useCallback(async (billId: string) => {
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
      await data.proposals.decide({ proposalId, action: 'reject', tenantId: activeTenant?.tenantId });

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
  }, [tempBills, activeTenant, bills, rejectLLMChange, reloadProposalsFromServer, setBills, setTempBills]);

  /** Approves all pending human proposals. */
  const acceptAllTempChanges = useCallback(async () => {
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
  }, [activeTenant, tempBills, acceptTempChange, reloadProposalsFromServer]);

  /** Rejects all pending human proposals. */
  const rejectAllTempChanges = useCallback(async () => {
    if (!canCommitStatus(activeTenant?.orgRole)) {
      toast({
        title: 'Forbidden',
        description: 'You do not have permission to reject changes.',
        variant: 'destructive',
      });
      return;
    }
    const humanProposals = tempBills.filter((t) => t.source === 'human');
    const ops = humanProposals.map((t) => rejectTempChange(t.id));
    await Promise.allSettled(ops);
    await reloadProposalsFromServer();
  }, [activeTenant, tempBills, rejectTempChange, reloadProposalsFromServer]);

  /**
   * Allows a user to undo/delete their own pending proposal.
   * Removes the proposal from the database and reverts the bill to its original status.
   */
  const undoProposal = useCallback(async (billId: string) => {
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

      await data.proposals.remove({ billId, tenantId: activeTenant?.tenantId });

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
  }, [tempBills, user, activeTenant, setBills, setTempBills]);

  return {
    proposeStatusChange,
    acceptTempChange,
    rejectTempChange,
    acceptAllTempChanges,
    rejectAllTempChanges,
    undoProposal,
  };
}
