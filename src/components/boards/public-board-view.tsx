'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import type { PublicBoard } from '@/types/tenant';
import { data } from '@/lib/data-client';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useTrackForSelf } from '@/hooks/use-track-for-self';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { KanbanHeader } from '@/components/kanban/kanban-header';
import KanbanBoardSkeleton from '@/components/kanban/skeletons/skeleton-board';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/core/utils';
import { RISE_IN } from '@/lib/core/motion';
import { BoardBillsBridge } from './active-boards-bills-bridge';
import { PublicBoardBanner } from './public-board-banner';

/**
 * One org's public board at /org/<slug>, for anyone — no account needed. The
 * same read-only kanban as the Following board; tracking a bill onto your own
 * board is offered only when signed in (cardVisibility hides it otherwise).
 */
export function PublicBoardView({ slug }: { slug: string }) {
  const { user } = useAuth();
  const [board, setBoard] = useState<PublicBoard | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading');
  const [trackedBillIds, setTrackedBillIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    data.boards
      .getPublicBoard({ slug })
      .then((b) => {
        if (cancelled) return;
        setBoard(b);
        setStatus('ready');
      })
      // Unknown slug, a board that went private, or a failed request all land
      // on the same message: there's no board to show here.
      .catch(() => {
        if (!cancelled) setStatus('not-found');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // The viewer's own tracked bills, so cards they already track say "Tracked".
  useEffect(() => {
    if (!user) {
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
  }, [user?.id]);

  const markBillTracked = useCallback((billId: string) => {
    setTrackedBillIds((prev) => (prev.has(billId) ? prev : new Set(prev).add(billId)));
  }, []);
  const handleTrackForSelf = useTrackForSelf(markBillTracked);
  // Stable Set so the KanbanCard memo comparator doesn't re-render every card.
  const testimonyBillIds = useMemo(() => new Set(board?.testimonyBillIds ?? []), [board]);

  if (status === 'loading') {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden p-2 md:p-4">
        <KanbanBoardSkeleton />
      </div>
    );
  }

  if (status === 'not-found' || !board) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className={cn('w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm', RISE_IN)}>
          <Lock className="mx-auto h-9 w-9 text-muted-foreground" />
          <h1 className="mt-2 text-lg font-semibold">This board isn&rsquo;t public</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The link may be wrong, or the organization has made its board private.
          </p>
          <Button asChild className="mt-5">
            <Link href="/boards/browse">
              Browse organizations
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Same bounded shell as the Following board: banner + header stay fixed and
  // only the columns scroll.
  return (
    <BoardBillsBridge bills={board.bills} loadingBills={false}>
      <div className="flex h-full min-h-0 flex-col">
        <PublicBoardBanner org={board.org} />
        <KanbanHeader variant="active-boards" />
        <KanbanBoard
          readOnly
          boardMode="active-boards"
          orgTestimonyBillIds={testimonyBillIds}
          trackedBillIds={trackedBillIds}
          onTrackForSelf={handleTrackForSelf}
        />
      </div>
    </BoardBillsBridge>
  );
}
