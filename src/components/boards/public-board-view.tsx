'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import type { PublicBoard } from '@/types/tenant';
import { data } from '@/lib/data-client';
import KanbanBoardSkeleton from '@/components/kanban/skeletons/skeleton-board';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/core/utils';
import { RISE_IN } from '@/lib/core/motion';
import { PublicBoardBanner } from './public-board-banner';
import { ReadOnlyOrgBoard } from './read-only-org-board';

/**
 * One org's public board at /community/<slug>, for anyone — no account needed. The
 * same read-only kanban as the Following board; tracking a bill onto your own
 * board is offered only when signed in (cardVisibility hides it otherwise).
 */
export function PublicBoardView({ slug }: { slug: string }) {
  const [board, setBoard] = useState<PublicBoard | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading');

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
            <Link href="/community">
              Browse organizations
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return <ReadOnlyOrgBoard board={board} banner={<PublicBoardBanner org={board.org} />} trackable />;
}
