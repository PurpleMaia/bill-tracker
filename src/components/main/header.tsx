'use client'; // Keep header client-side for search input interaction

import { Input } from '@/components/ui/input';
import { KanbanSquareIcon, ListCheck, Search, Table, Users2Icon } from 'lucide-react';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { AuthHeader } from '../auth/auth-header';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

export function Header() {
  const { view: currentView, setView } = useKanbanBoard();
  const { user, activeTenant, memberships, setActiveTenant } = useAuth();
  const publicViews = ['kanban', 'spreadsheet'];

  const orgRole = activeTenant?.orgRole;
  // NOTE: 'approvals' tab deprecated — removed from header nav but view/route still exists
  const views = user
    ? orgRole === 'admin'
      ? ['kanban', 'spreadsheet', 'admin']
      : orgRole === 'worker'
        ? ['kanban', 'spreadsheet']
        : ['kanban', 'spreadsheet']
    : publicViews;

  const { setSearchQuery } = useKanbanBoard(); // Access context

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value

    setSearchQuery(query);
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center px-8 py-4 border-b-[3px] border-olive bg-primary text-primary-foreground">
        {/* Info */}
        <div className="flex-shrink-0 flex items-center gap-3">
          {/* FOOD+ LOGO HERE */}
          <h1 className="text-xl font-semibold text-primary-foreground">
            {activeTenant?.name ?? 'Food+'} Bill Tracker
          </h1>
          {memberships.length > 1 && (
            <select
              value={activeTenant?.tenantId ?? ''}
              onChange={(e) => setActiveTenant(e.target.value)}
              className="text-sm bg-white/10 border border-white/20 text-white rounded-md px-2 py-1"
            >
              {memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId} className="text-black">
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* View Select Bar */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex justify-center w-fit">
          <Tabs
            value={currentView}
            onValueChange={(v) => setView(v as "kanban" | "spreadsheet" | "admin" | "approvals" | "supervisor")}
            className='rounded-md shadow-sm'
          >
            <TabsList className="bg-secondary">
              {views.map(v => (
                <TabsTrigger key={v} value={v}
                  className='data-[state=active]:bg-primary data-[state=active]:text-white text-secondary-foreground'
                >
                  {getIconForView(v)} {v.charAt(0).toUpperCase() + v.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Search and Auth */}
        <div className="relative max-w-md flex gap-4 flex-shrink-0 ml-auto">
          <Search className="absolute left-3 top-3 h-4 w-4 text-white/60" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-full rounded-md bg-white/10 border border-white/20 text-white placeholder:text-white/60 pl-9 focus:bg-white/20 shadow-sm"
            onChange={handleSearchChange}
            aria-label="Search bills"
          />
          <AuthHeader />
        </div>
      </header>
    </>
  );
}

function getIconForView(view: string) {
  switch (view) {
    case 'kanban':
      return <KanbanSquareIcon className="h-5 w-5 mr-2" />;
    case 'spreadsheet':
      return <Table className="h-5 w-5 mr-2" />;
    case 'approvals':
      return <ListCheck className="h-5 w-5 mr-2" />;
    case 'admin':    
      return <Users2Icon className="h-5 w-5 mr-2" />;
    default:
      return null;
  }
}