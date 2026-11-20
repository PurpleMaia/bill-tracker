'use client';

import { useCallback } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';
import { toast } from '@/hooks/use-toast';
import { useViewOnBoard } from '@/hooks/use-view-on-board';
import { ToastAction } from '@/components/ui/toast';
import type { Bill } from '@/types/legislation';

/**
 * "Track this bill" from someone else's board (Following or a public board):
 * copies the bill onto the viewer's own board, then toasts a "View on board"
 * link. Must be called outside the board's bills bridge, so useBills() is the
 * viewer's own board.
 *
 * Stable identity so the KanbanCard memo comparator (which compares
 * onTrackForSelf) does not re-render every card on each parent render.
 */
export function useTrackForSelf(markBillTracked: (billId: string) => void) {
  const { activeTenant } = useAuth();
  const viewOnBoard = useViewOnBoard();
  const { refreshBills } = useBills();

  return useCallback(
    async (bill: Bill) => {
      try {
        const res = await fetch('/api/bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: activeTenant?.tenantId, billUrl: bill.bill_url }),
        });
        if (!res.ok) throw new Error('Failed');
        markBillTracked(bill.id);
        // markBillTracked only updates this view. Your Bills reads the root
        // BillsProvider, which doesn't refetch on navigation — refresh it so
        // "View on board" lands on a board that actually has the bill.
        void refreshBills();
        toast({
          title: 'Bill tracked',
          description: `${bill.bill_number} added to your board.`,
          // Longer than the 4s default: long enough to reach the action.
          duration: 6000,
          action: (
            <ToastAction altText={`View ${bill.bill_number} on your board`} onClick={() => viewOnBoard(bill.id)}>
              View on board
            </ToastAction>
          ),
        });
      } catch {
        toast({
          title: 'Could not track bill',
          description: 'Please try again.',
          variant: 'destructive',
          duration: 5000,
        });
      }
    },
    [activeTenant?.tenantId, markBillTracked, refreshBills, viewOnBoard],
  );
}
