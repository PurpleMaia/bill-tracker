'use client';

import { ProtectedKanbanBoardOrSpreadsheet } from '@/components/kanban/protected-kanban-board';
import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { SupervisorDashboard } from '@/components/supervisor/supervisor-dashboard';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { BottomTabBar } from '@/components/main/bottom-tab-bar';
import { LoginWall } from '@/components/auth/login-wall';

export default function Home() {
  const { view } = useKanbanBoard();
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <LoginWall />;

  return (
    <>
      {view === 'admin' ? (
        <AdminDashboard />
      ) : view === 'supervisor' ? (
        <SupervisorDashboard />
      ) : (
        <ProtectedKanbanBoardOrSpreadsheet />
      )}
      <BottomTabBar />
    </>
  );
}
