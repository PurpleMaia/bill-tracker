'use client';

import { Input } from '@/components/ui/input';
import { KanbanSquareIcon, ListCheck, Search, Table, Users2Icon } from 'lucide-react';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { AuthHeader } from '../auth/auth-header';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { MobileHamburgerMenu } from './mobile-hamburger-menu';
import { TagFilterList } from '../tags/tag-filter-list';

export function Header() {
  const { view: currentView, setView } = useKanbanBoard();
  const { user, activeTenant, memberships, setActiveTenant } = useAuth();
  const publicViews = ['kanban', 'spreadsheet'];

  const orgRole = activeTenant?.orgRole;
  const views = user
    ? orgRole === 'admin'
      ? ['kanban', 'spreadsheet', 'admin']
      : orgRole === 'worker'
        ? ['kanban', 'spreadsheet']
        : ['kanban', 'spreadsheet']
    : publicViews;

  const { setSearchQuery, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears, deadFilter, setDeadFilter } = useKanbanBoard();

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
  };

  return (
    <>
      <header className="sticky top-0 z-10 border-b-[3px] border-olive bg-primary text-primary-foreground">
        {/* Top row */}
        <div className="flex items-center px-3 md:px-8 py-3 md:py-4">
          {/* Title — always visible */}
          <div className="flex-shrink-0 flex items-center gap-3">
            <h1 className="text-lg md:text-xl font-semibold text-primary-foreground">
              {activeTenant?.name ?? 'Food+'} Bill Tracker
            </h1>
            {/* Tenant selector — desktop only */}
            {memberships.length > 1 && (
              <select
                value={activeTenant?.tenantId ?? ''}
                onChange={(e) => setActiveTenant(e.target.value)}
                className="hidden md:block text-sm bg-white/10 border border-white/20 text-white rounded-md px-2 py-1"
              >
                {memberships.map((m) => (
                  <option key={m.tenantId} value={m.tenantId} className="text-black">
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* View tabs — desktop only, absolutely centered */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 justify-center w-fit">
            <Tabs
              value={currentView}
              onValueChange={(v) => setView(v as "kanban" | "spreadsheet" | "admin" | "approvals" | "supervisor")}
              className="rounded-md shadow-sm"
            >
              <TabsList className="bg-secondary">
                {views.map(v => (
                  <TabsTrigger key={v} value={v}
                    className="data-[state=active]:bg-primary data-[state=active]:text-white text-secondary-foreground"
                  >
                    {getIconForView(v)} {v.charAt(0).toUpperCase() + v.slice(1)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Search and Auth — desktop only */}
          <div className="hidden md:flex relative max-w-md gap-4 flex-shrink-0 ml-auto">
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

          {/* Hamburger menu — mobile only */}
          <div className="md:hidden ml-auto">
            <MobileHamburgerMenu />
          </div>
        </div>

        {/* Mobile search + filter row */}
        <div className="md:hidden flex items-center gap-2 px-3 pb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-white/60" />
            <Input
              type="search"
              placeholder="Search bills..."
              className="w-full rounded-md bg-white/10 border border-white/20 text-white placeholder:text-white/60 pl-9 focus:bg-white/20 shadow-sm"
              onChange={handleSearchChange}
              aria-label="Search bills"
            />
          </div>
          <div className="[&>*>div>.flex-wrap]:hidden [&_button]:bg-white/10 [&_button]:border-white/20 [&_button]:text-white [&_button]:hover:bg-white/20 shrink-0">
          <TagFilterList
            selectedTagIds={selectedTagIds}
            onTagToggle={(tagId: string) => {
              setSelectedTagIds((prev) =>
                prev.includes(tagId)
                  ? prev.filter((id) => id !== tagId)
                  : [...prev, tagId]
              );
            }}
            selectedYears={selectedYears}
            onYearToggle={(year: number) => {
              setSelectedYears((prev) =>
                prev.includes(year)
                  ? prev.filter((y) => y !== year)
                  : [...prev, year]
              );
            }}
            deadFilter={deadFilter}
            onDeadFilterChange={setDeadFilter}
            onClearFilters={() => {
              setSelectedTagIds([]);
              setSelectedYears([]);
              setDeadFilter('all');
            }}
          />
          </div>
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
