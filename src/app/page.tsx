'use client';

import { Header } from '@/components/main/header';
import { ProtectedKanbanBoardOrSpreadsheet } from '@/components/kanban/protected-kanban-board';
import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { SupervisorDashboard } from '@/components/supervisor/supervisor-dashboard';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { BottomTabBar } from '@/components/main/bottom-tab-bar';

export default function Home() {
  const { view } = useKanbanBoard();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 overflow-auto pb-14 md:pb-0">
        {view === 'admin' ? (
          <AdminDashboard />
        ) : view === 'supervisor' ? (
          <SupervisorDashboard />
        ) : (
          <ProtectedKanbanBoardOrSpreadsheet />
        )}
      </main>

      <BottomTabBar />
    </div>
  );
}
