'use client';

import { KanbanSquareIcon, Table, Users2Icon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { cn } from '@/lib/core/utils';

const VIEW_META = {
  kanban: { label: 'Kanban', Icon: KanbanSquareIcon },
  spreadsheet: { label: 'Spreadsheet', Icon: Table },
  admin: { label: 'Admin', Icon: Users2Icon },
} as const;

type ViewId = keyof typeof VIEW_META;

/**
 * Board view switcher. `compact` renders icon-only triggers (with accessible
 * labels) for tight spots like the mobile board header.
 */
export function ViewToggle({ compact = false }: { compact?: boolean }) {
  const { view: currentView, setView } = useKanbanBoard();
  const { user, activeTenant } = useAuth();

  const orgRole = activeTenant?.orgRole;
  const views: ViewId[] =
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
        {views.map((v) => {
          const { label, Icon } = VIEW_META[v];
          return (
            <TabsTrigger
              key={v}
              value={v}
              aria-label={compact ? `${label} view` : undefined}
              title={compact ? `${label} view` : undefined}
              className="data-[state=active]:bg-primary data-[state=active]:text-white text-secondary-foreground"
            >
              <Icon className={cn('h-5 w-5', !compact && 'mr-2')} />
              {!compact && label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
