'use client';

import { KanbanSquareIcon, Table, Users2Icon } from 'lucide-react';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { cn } from '@/lib/utils';

export function BottomTabBar() {
  const { view, setView } = useKanbanBoard();
  const { user, activeTenant } = useAuth();

  const orgRole = activeTenant?.orgRole;
  const tabs = user
    ? orgRole === 'admin'
      ? (['kanban', 'spreadsheet', 'admin'] as const)
      : (['kanban', 'spreadsheet'] as const)
    : (['kanban', 'spreadsheet'] as const);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-background/95 backdrop-blur py-2">
      {tabs.map((tab) => {
        const isActive = view === tab;
        return (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors',
              isActive
                ? 'text-primary font-semibold'
                : 'text-muted-foreground'
            )}
          >
            {tab === 'kanban' && <KanbanSquareIcon className="h-5 w-5" />}
            {tab === 'spreadsheet' && <Table className="h-5 w-5" />}
            {tab === 'admin' && <Users2Icon className="h-5 w-5" />}
            <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
          </button>
        );
      })}
    </nav>
  );
}
