'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { KanbanHeader } from '@/components/kanban/kanban-header';
import { Button } from '@/components/ui/button';
import { OrgSwitcherDropdown } from './org-switcher-dropdown';
import { ActiveBoardIdentity } from './active-board-identity';
import { ActiveBoardsBillsBridge } from './active-boards-bills-bridge';
import { useAuth } from '@/hooks/contexts/auth-context';
import { toast } from '@/hooks/use-toast';
import type { Bill } from '@/types/legislation';

export function ActiveBoardView() {
  const { followedOrgs, testimonyBillIds, trackedBillIds, markBillTracked } = useActiveBoards();
  const { activeTenant } = useAuth();

  // Stable identity so the KanbanCard memo comparator (which compares
  // onTrackForSelf) does not re-render every card on each parent render.
  const handleTrackForSelf = useCallback(
    async (bill: Bill) => {
      try {
        const res = await fetch('/api/bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: activeTenant?.tenantId, billUrl: bill.bill_url }),
        });
        if (!res.ok) throw new Error('Failed');
        markBillTracked(bill.id);
        toast({
          title: 'Bill tracked',
          description: `${bill.bill_number} added to your board.`,
          duration: 4000,
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
    [activeTenant?.tenantId, markBillTracked],
  );

  if (followedOrgs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <LayoutGrid className="h-10 w-10" />
        <p className="text-base font-medium text-foreground">No followed boards</p>
        <p className="text-sm">Follow an organization to see their tracked bills here.</p>
        <Button asChild size="sm">
          <Link href="/boards/browse">Browse organizations</Link>
        </Button>
      </div>
    );
  }

  // Matches the "Your Bills" board shell exactly: a bounded flex column
  // (h-full min-h-0) so the KanbanHeader is fixed and only the columns scroll,
  // with the shared KanbanHeader for identical chrome/search/filters.
  return (
    <ActiveBoardsBillsBridge>
      <div className="flex h-full min-h-0 flex-col">
        <KanbanHeader
          variant="active-boards"
          rightSlot={<OrgSwitcherDropdown />}
        />
        <KanbanBoard
          readOnly
          boardMode="active-boards"
          orgTestimonyBillIds={testimonyBillIds}
          trackedBillIds={trackedBillIds}
          onTrackForSelf={handleTrackForSelf}
        />
      </div>
    </ActiveBoardsBillsBridge>
  );
}
