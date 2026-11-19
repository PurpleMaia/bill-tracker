'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';

/**
 * "View on board" for a just-tracked bill: opens Your Bills with ?focus=<id>,
 * which KanbanBoard consumes to scroll to the bill's column and card and ring
 * it. Switches to the kanban view first — focusing needs the board mounted,
 * and the user may have left it on Spreadsheet or Calendar.
 */
export function useViewOnBoard() {
  const router = useRouter();
  const { setView } = useKanbanBoard();
  return useCallback(
    (billId: string) => {
      setView('kanban');
      router.push(`/your-bills?focus=${encodeURIComponent(billId)}`);
    },
    [router, setView],
  );
}
