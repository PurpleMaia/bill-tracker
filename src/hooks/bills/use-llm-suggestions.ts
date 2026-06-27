'use client';

import { useCallback, Dispatch, SetStateAction } from 'react';
import type { Bill, TempBill } from '@/types/legislation';
import { toast } from '@/hooks/use-toast';
import { data } from '@/lib/data-client';

interface ActiveTenant {
  tenantId?: string;
}

interface Params {
  bills: Bill[];
  setBills: Dispatch<SetStateAction<Bill[]>>;
  setTempBills: Dispatch<SetStateAction<TempBill[]>>;
  activeTenant: ActiveTenant | null | undefined;
}

/**
 * LLM-suggestion controls (accept/reject one or all). Extracted from
 * bills-context (SECTION 1). Accepting commits the suggested status via the
 * data-client; rejecting reverts to the bill's previous status locally.
 */
export function useLlmSuggestions({ bills, setBills, setTempBills, activeTenant }: Params) {
  /** Accepts an LLM suggestion and commits the status change to the database. */
  const acceptLLMChange = useCallback(async (billId: string) => {
    const bill = bills.find((b) => b.id === billId);
    if (!bill || !bill.llm_suggested) return;

    try {
      await data.bills.updateStatus({
        billId,
        newStatus: bill.current_bill_status,
        tenantId: activeTenant?.tenantId,
      });

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
  }, [bills, activeTenant, setBills, setTempBills]);

  /** Rejects an LLM suggestion and reverts to the previous status. */
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
  }, [bills, setBills, setTempBills]);

  /** Rejects all pending LLM suggestions. */
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

  /** Accepts all pending LLM suggestions. */
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

  return { acceptLLMChange, rejectLLMChange, rejectAllLLMChanges, acceptAllLLMChanges };
}
