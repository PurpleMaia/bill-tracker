'use client';

import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, RotateCw, Star } from 'lucide-react';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { KanbanHeader } from '@/components/kanban/kanban-header';
import { Button } from '@/components/ui/button';
import KanbanBoardSkeleton from '@/components/kanban/skeletons/skeleton-board';
import { ActiveBoardBanner } from './active-board-banner';
import { ActiveBoardsBillsBridge } from './active-boards-bills-bridge';
import { useAuth } from '@/hooks/contexts/auth-context';
import { toast } from '@/hooks/use-toast';
import type { Bill } from '@/types/legislation';

export function ActiveBoardView() {
  const {
    followedOrgs, followedStatus, retryFollowed, selectOrg,
    testimonyBillIds, trackedBillIds, markBillTracked,
  } = useActiveBoards();
  const { activeTenant } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orgParam = searchParams.get('org');

  // "View board" links from Browse land here as /boards?org=<id>. Select it
  // right away — this effect runs before the provider's, so a cold load fetches
  // only the requested board, and refreshFollowed's reconcile keeps it if
  // followed (falling back otherwise). Then strip just `org`, leaving e.g. a
  // ?bill= deep link intact, so it can't fight later picks from the switcher.
  useEffect(() => {
    if (!orgParam) return;
    const known = followedStatus !== 'ready' || followedOrgs.some((o) => o.tenantId === orgParam);
    if (known) selectOrg(orgParam);
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete('org');
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // Keyed on the param alone: it's consumed once, then removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgParam]);

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

  // Skeleton while the followed list loads (an empty list isn't "follows no
  // one" yet) and for the one render before a ?org= pick is applied, so the
  // previously selected org's board doesn't flash first.
  if (followedStatus === 'loading' || orgParam) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden p-2 md:p-4">
        <KanbanBoardSkeleton />
      </div>
    );
  }

  if (followedStatus === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="h-9 w-9 text-destructive" />
        <h2 className="text-base font-semibold">Couldn&rsquo;t load the boards you follow</h2>
        <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
        <Button size="sm" variant="outline" onClick={() => retryFollowed()}>
          <RotateCw className="mr-1.5 h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  if (followedOrgs.length === 0) {
    const steps = [
      <>Find an org on <span className="font-medium text-foreground">Browse</span></>,
      <>Click <span className="font-medium text-foreground">Follow</span></>,
      <>Their board appears <span className="font-medium text-foreground">here</span></>,
    ];
    return (
      <div className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-lg rounded-xl border bg-card p-6 text-center shadow-sm">
          <Star className="mx-auto h-9 w-9 text-primary" />
          <h2 className="mt-2 text-lg font-semibold">See what other organizations are tracking</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Boards from orgs you follow show up here. They&rsquo;re read-only and separate
            from <span className="font-medium text-foreground">Your Bills</span>, and you can
            copy any of their bills onto your own board.
          </p>
          <ol className="mt-4 grid grid-cols-1 gap-2 rounded-lg bg-secondary/50 p-2 text-left sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 rounded-md bg-background p-2 text-sm text-muted-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
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

  // Matches the "Your Bills" board shell: a bounded flex column (h-full min-h-0)
  // so the banner + KanbanHeader stay fixed and only the columns scroll. The
  // banner is what sets it apart from Your Bills; the chrome below is shared.
  return (
    <ActiveBoardsBillsBridge>
      <div className="flex h-full min-h-0 flex-col">
        <ActiveBoardBanner />
        <KanbanHeader variant="active-boards" />
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
