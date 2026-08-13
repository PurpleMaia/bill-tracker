'use client';

import { ActiveBoardView } from '@/components/boards/active-board-view';
import { BoardsLoginWall } from '@/components/boards/boards-login-wall';
import { useAuth } from '@/hooks/contexts/auth-context';
import KanbanBoardSkeleton from '@/components/kanban/skeletons/skeleton-board';

export default function BoardsPage() {
  const { user, loading } = useAuth();

  // Same shape as Your Bills: show the board skeleton rather than a blank frame
  // while the session resolves, since the board is what usually renders here.
  if (loading) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden p-2 md:p-4">
        <KanbanBoardSkeleton />
      </div>
    );
  }

  // Viewing a specific org's board requires an account (following is per-user),
  // but browsing the list of public orgs stays open to everyone.
  if (!user) return <BoardsLoginWall />;

  return <ActiveBoardView />;
}
