'use client';

import { useAuth } from '@/hooks/contexts/auth-context';
import KanbanBoardSkeleton from '@/components/kanban/skeletons/skeleton-board';
import { MyOrgBoardView } from './my-org-board-view';
import { PublicBoardView } from './public-board-view';

/**
 * /community/<slug>: one URL per org board. An admin opening their own org's
 * link gets the preview (works while private, with a Settings shortcut);
 * everyone else gets the public board, or "isn't public" if it's private.
 */
export function OrgBoardRoute({ slug }: { slug: string }) {
  const { activeTenant, loading } = useAuth();

  // Wait for the session: deciding before it resolves would flash the public
  // board (or "isn't public") at an admin about to get their preview.
  if (loading) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden p-2 md:p-4">
        <KanbanBoardSkeleton />
      </div>
    );
  }

  if (activeTenant?.orgRole === 'admin' && activeTenant.slug === slug) {
    return <MyOrgBoardView />;
  }
  return <PublicBoardView slug={slug} />;
}
