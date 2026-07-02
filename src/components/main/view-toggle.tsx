'use client';

import { KanbanSquareIcon, Table, Users2Icon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';

export function ViewToggle() {
  const { view: currentView, setView } = useKanbanBoard();
  const { user, activeTenant } = useAuth();

  const orgRole = activeTenant?.orgRole;
  const views =
    user && orgRole === 'admin'
      ? ['kanban', 'spreadsheet', 'admin']
      : ['kanban', 'spreadsheet'];

  return (
    <Tabs
      value={currentView}
      onValueChange={(v) => setView(v as 'kanban' | 'spreadsheet' | 'admin' | 'supervisor')}
      className="rounded-md shadow-sm"
    >
      <TabsList className="bg-secondary">
        {views.map((v) => (
          <TabsTrigger
            key={v}
            value={v}
            className="data-[state=active]:bg-primary data-[state=active]:text-white text-secondary-foreground"
          >
            {getIconForView(v)} {v.charAt(0).toUpperCase() + v.slice(1)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function getIconForView(view: string) {
  switch (view) {
    case 'kanban':
      return <KanbanSquareIcon className="h-5 w-5 mr-2" />;
    case 'spreadsheet':
      return <Table className="h-5 w-5 mr-2" />;
    case 'admin':
      return <Users2Icon className="h-5 w-5 mr-2" />;
    default:
      return null;
  }
}
