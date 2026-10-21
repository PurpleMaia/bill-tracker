'use client';

import { useCallback, Dispatch, SetStateAction } from 'react';
import type { Bill } from '@/types/legislation';

interface Params {
  setBills: Dispatch<SetStateAction<Bill[]>>;
}

/**
 * Local bill-list CRUD (no server calls) — add/update/remove a bill in the
 * client array. Extracted from bills-context (SECTION 3).
 */
export function useBillCrud({ setBills }: Params) {
  /**
   * Adds a new bill to the bills array.
   * If bill already exists, updates it instead.
   */
  const addBill = useCallback((bill: Bill) => {
    setBills((prevBills) => {
      const exists = prevBills.some((b) => b.id === bill.id);
      if (exists) {
        console.warn(`Bill ${bill.id} already exists, updating instead`);
        return prevBills.map((b) => (b.id === bill.id ? bill : b));
      }
      return [...prevBills, bill];
    });
  }, [setBills]);

  /**
   * Updates specific fields of a bill without refreshing the entire list.
   * Preserves Kanban board state (scroll position, drag state, etc.).
   */
  const updateBill = useCallback((billId: string, updates: Partial<Bill>) => {
    setBills((prevBills) =>
      prevBills.map((bill) =>
        bill.id === billId ? { ...bill, ...updates } : bill
      )
    );
  }, [setBills]);

  /** Removes a bill from the bills array. */
  const removeBill = useCallback((billId: string) => {
    setBills((prevBills) => prevBills.filter((bill) => bill.id !== billId));
  }, [setBills]);

  return { addBill, updateBill, removeBill };
}
