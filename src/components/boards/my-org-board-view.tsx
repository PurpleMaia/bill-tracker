'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Globe, Lock, RotateCw, Settings } from 'lucide-react';
import type { MyOrgBoard } from '@/types/tenant';
import { data } from '@/lib/data-client';
import { useAuth } from '@/hooks/contexts/auth-context';
import KanbanBoardSkeleton from '@/components/kanban/skeletons/skeleton-board';
import { Button } from '@/components/ui/button';
import { OrganizationDialog, type OrganizationTab } from '@/components/admin/organization-dialog';
import { cn } from '@/lib/core/utils';
import { RISE_IN } from '@/lib/core/motion';
import { publicBoardUrl } from '@/lib/boards/board-routes';
import { initials } from './active-board-banner';
import { CopyLinkButton } from './copy-link-button';
import { ReadOnlyOrgBoard } from './read-only-org-board';

/** Centered message card for the states with no board to show. */
function MessageCard({ icon: Icon, title, body, children }: {
  icon: typeof Lock;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-4 md:p-8">
      <div className={cn('w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm', RISE_IN)}>
        <Icon className="mx-auto h-9 w-9 text-muted-foreground" />
        <h1 className="mt-2 text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * "Whose board is this?" banner for the admin preview: says it's how others
 * see your board, whether it's public, a copy button for its link when it is,
 * and where to change that.
 */
function MyOrgBoardBanner({ board, onOpenSettings }: { board: MyOrgBoard; onOpenSettings: () => void }) {
  const { org, publicBoard } = board;
  return (
    <div className="flex items-center gap-3 border-b border-olive/30 bg-olive-soft px-4 py-3">
      <div
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-olive-dark text-sm font-bold text-white"
      >
        {initials(org.name)}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold">{org.name}&rsquo;s Tracker</h1>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              publicBoard ? 'bg-olive/15 text-olive-dark' : 'bg-red-100 text-red-700',
            )}
          >
            {publicBoard ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {publicBoard ? 'Public' : 'Private'}
          </span>
        </div>
        <p className="truncate text-xs text-olive-dark">
          {publicBoard
            ? 'This is what anyone sees at this link'
            : 'Only you can see this until you make your board public'}
        </p>
      </div>
      {/* A private board has no link to share yet. */}
      {publicBoard && <CopyLinkButton url={publicBoardUrl(org.slug)} label="Copy link to your board" text="Copy Link" />}
      <Button size="sm" className="shrink-0" onClick={onOpenSettings} aria-label="Organization Settings">
        <Settings className="h-4 w-4 sm:mr-1.5" />
        <span className="sr-only sm:not-sr-only">Settings</span>
      </Button>
    </div>
  );
}

/**
 * An org admin's view of their own board at /community/<slug> — the same link
 * they share. Unlike the public view of that link, it works while the board is
 * private, so admins can check what they'd be sharing before turning it on.
 */
export function MyOrgBoardView() {
  const { activeTenant, loading: authLoading } = useAuth();
  const tenantId = activeTenant?.tenantId;
  const isAdmin = activeTenant?.orgRole === 'admin';
  const [board, setBoard] = useState<MyOrgBoard | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // Closing Organization Settings reloads, so a visibility change shows at once.
  const [orgTab, setOrgTab] = useState<OrganizationTab | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!tenantId || !isAdmin) return;
    let cancelled = false;
    // Only the first load shows the skeleton; a reload swaps data in place.
    if (reloadKey === 0) setStatus('loading');
    data.boards
      .getMyOrgBoard({ tenantId })
      .then((b) => {
        if (cancelled) return;
        setBoard(b);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, isAdmin, reloadKey]);

  if (authLoading || (isAdmin && status === 'loading')) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden p-2 md:p-4">
        <KanbanBoardSkeleton />
      </div>
    );
  }

  // The tab is admin-only, but the URL can still be typed or bookmarked.
  if (!isAdmin) {
    return (
      <MessageCard
        icon={Lock}
        title="For organization admins"
        body="Organization admins can preview how their organization’s board looks to others here."
      >
        <Button asChild className="mt-5">
          <Link href="/community">
            Browse organizations
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </MessageCard>
    );
  }

  if (status === 'error' || !board) {
    return (
      <MessageCard icon={RotateCw} title="Couldn’t load your board" body="Check your connection and try again.">
        <Button className="mt-5" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </MessageCard>
    );
  }

  return (
    <>
      <ReadOnlyOrgBoard
        board={board}
        banner={<MyOrgBoardBanner board={board} onOpenSettings={() => setOrgTab('settings')} />}
        trackable={false}
      />
      <OrganizationDialog
        tab={orgTab}
        onTabChange={(tab) => {
          setOrgTab(tab);
          if (tab === null) setReloadKey((k) => k + 1);
        }}
      />
    </>
  );
}
