'use client';

import { ProtectedKanbanBoardOrSpreadsheet } from '@/components/kanban/protected-kanban-board';
import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { SupervisorDashboard } from '@/components/supervisor/supervisor-dashboard';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { LoginWall } from '@/components/auth/login-wall';
import KanbanBoardSkeleton from '@/components/kanban/skeletons/skeleton-board';

export default function YourBills() {
  const { view } = useKanbanBoard();
  const { user, loading } = useAuth();

  // Never paint a blank frame while the session resolves — the default view
  // is the board, so its skeleton is the closest guess at the final layout
  if (loading) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden p-2 md:p-4">
        <KanbanBoardSkeleton />
      </div>
    );
  }

  if (!user) return <LoginWall />;

  return view === 'admin' ? (
    <AdminDashboard />
  ) : view === 'supervisor' ? (
    <SupervisorDashboard />
  ) : (
    <ProtectedKanbanBoardOrSpreadsheet />
  );
}
