'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/contexts/auth-context';
import KanbanBoardSkeleton from '@/components/kanban/skeletons/skeleton-board';
import { COMMUNITY_BROWSE, publicBoardPath } from '@/lib/boards/board-routes';

/**
 * Old/bookmarked "Your Organization" address. An org's board lives at its own
 * /community/<slug>, which depends on who's signed in, so this can't be a
 * static redirect: forward admins to their org's board, everyone else to Browse.
 */
export default function YourOrganizationRedirect() {
  const { activeTenant, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const target =
      activeTenant?.orgRole === 'admin' ? publicBoardPath(activeTenant.slug) : COMMUNITY_BROWSE;
    router.replace(target);
  }, [loading, activeTenant, router]);

  return (
    <div className="min-h-0 w-full flex-1 overflow-hidden p-2 md:p-4">
      <KanbanBoardSkeleton />
    </div>
  );
}
