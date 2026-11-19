'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicBoard } from '@/types/tenant';
import { data } from '@/lib/data-client';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useTrackForSelf } from '@/hooks/use-track-for-self';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { KanbanHeader } from '@/components/kanban/kanban-header';
import { BoardBillsBridge } from './active-boards-bills-bridge';

/**
 * An org's board as visitors see it: the read-only Active Boards kanban under
 * a caller-supplied banner. Shared by the public /org/<slug> page and an
 * admin's /community/public-view preview. `trackable` offers "Track this bill" (signed-in
 * viewers only — cardVisibility hides it otherwise); off for your own org,
 * whose bills are already on your board.
 */
export function ReadOnlyOrgBoard({
  board,
  banner,
  trackable,
}: {
  board: PublicBoard;
  banner: ReactNode;
  trackable: boolean;
}) {
  const { user } = useAuth();
  // Keyed on the id, not the object, so a session refresh doesn't refetch.
  const userId = user?.id;
  const [trackedBillIds, setTrackedBillIds] = useState<Set<string>>(new Set());

  // The viewer's own tracked bills, so cards they already track say "Tracked".
  useEffect(() => {
    if (!trackable || !userId) {
      setTrackedBillIds(new Set());
      return;
    }
    let cancelled = false;
    data.boards
      .getMyTrackedBillIds()
      .then((ids) => {
        if (!cancelled) setTrackedBillIds(new Set(ids));
      })
      .catch((e) => console.error('Failed to load tracked bill ids:', e));
    return () => {
      cancelled = true;
    };
  }, [trackable, userId]);

  const markBillTracked = useCallback((billId: string) => {
    setTrackedBillIds((prev) => (prev.has(billId) ? prev : new Set(prev).add(billId)));
  }, []);
  const handleTrackForSelf = useTrackForSelf(markBillTracked);
  // Stable Set so the KanbanCard memo comparator doesn't re-render every card.
  const testimonyBillIds = useMemo(() => new Set(board.testimonyBillIds), [board]);

  // Same bounded shell as the Following board: banner + header stay fixed and
  // only the columns scroll.
  return (
    <BoardBillsBridge bills={board.bills} loadingBills={false}>
      <div className="flex h-full min-h-0 flex-col">
        {banner}
        <KanbanHeader variant="active-boards" />
        <KanbanBoard
          readOnly
          boardMode="active-boards"
          orgTestimonyBillIds={testimonyBillIds}
          trackedBillIds={trackedBillIds}
          onTrackForSelf={trackable ? handleTrackForSelf : undefined}
        />
      </div>
    </BoardBillsBridge>
  );
}
