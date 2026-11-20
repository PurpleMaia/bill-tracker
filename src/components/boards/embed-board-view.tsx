'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Lock } from 'lucide-react';
import type { PublicBoard, PublicBoardOrg } from '@/types/tenant';
import type { Bill } from '@/types/legislation';
import { data } from '@/lib/data-client';
import { publicBillUrl, publicBoardPath } from '@/lib/boards/board-routes';
import KanbanBoardSkeleton from '@/components/kanban/skeletons/skeleton-board';
import { initials } from './active-board-banner';
import { ReadOnlyOrgBoard } from './read-only-org-board';

/** Whose Tracker this is, and the way out to the full site. */
function EmbedStrip({ org }: { org: PublicBoardOrg }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-olive/30 bg-olive-soft px-3 py-2">
      <div
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-olive-dark text-xs font-bold text-white"
      >
        {initials(org.name)}
      </div>
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{org.name}&rsquo;s Tracker</h1>
      <a
        href={publicBoardPath(org.slug)}
        target="_blank"
        rel="noopener"
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-olive-dark hover:bg-olive/15"
      >
        <span className="max-sm:sr-only">Open on Hawaiʻi Bill Tracker</span>
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}

/**
 * An org's public board framed on another website (/embed/<slug>): the
 * read-only kanban under a slim strip, with none of the app around it. Always
 * signed-out in behavior — no follow or tracking — and a bill opens on the
 * site in a new tab rather than in a dialog squeezed into the frame.
 */
export function EmbedBoardView({ slug }: { slug: string }) {
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
      .catch(() => {
        if (!cancelled) setStatus('not-found');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const openBill = useCallback(
    (bill: Bill) => window.open(publicBillUrl(slug, bill.id), '_blank', 'noopener'),
    [slug],
  );

  if (status === 'loading') {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden p-2">
        <KanbanBoardSkeleton />
      </div>
    );
  }

  if (status === 'not-found' || !board) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4 text-center">
        <Lock className="h-7 w-7 text-muted-foreground" />
        <h1 className="mt-1 text-base font-semibold">This board isn&rsquo;t public</h1>
        <p className="text-sm text-muted-foreground">
          See bills on{' '}
          <a href="/" target="_blank" rel="noopener" className="font-medium text-olive-dark underline">
            Hawaiʻi Bill Tracker
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <ReadOnlyOrgBoard
      board={board}
      banner={<EmbedStrip org={board.org} />}
      trackable={false}
      onCardClick={openBill}
    />
  );
}
