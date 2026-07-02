'use client';

import { useAuth } from '@/hooks/contexts/auth-context';
import { Switch } from '../ui/switch';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { Label } from '../ui/label';
import NewBillButton from './new-bill/new-bill-button';
import { TrackBillDialog } from './track-bill-dialog';
import { ExportCsvDialog } from './export-csv-dialog';
import { useBills } from '@/hooks/contexts/bills-context';
import { TagFilterList } from '../tags/tag-filter-list';
import { Input } from '../ui/input';
import { Search } from 'lucide-react';

export function KanbanHeader() {
  const { user, activeTenant } = useAuth();
  const { viewMode, toggleViewMode, showArchived, toggleShowArchived } = useBills();
  const { view, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears, deadFilter, setDeadFilter, searchQuery, setSearchQuery } = useKanbanBoard();

  const isPublic = !user;
  const canAddRemoveBills = activeTenant?.orgRole === 'admin';

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const filterControls = (
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
      showStatusFilter={view === 'spreadsheet'}
      onClearFilters={() => {
        setSelectedTagIds([]);
        setSelectedYears([]);
        setDeadFilter('all');
      }}
    />
  );

  return (
    <div className="p-2 border-b bg-white shadow-md">
      {/* Mobile: search + filter row */}
      <div className="md:hidden flex items-center gap-2 px-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search bills..."
            className="pl-9"
            value={searchQuery}
            onChange={handleSearchChange}
            aria-label="Search bills"
          />
        </div>
        {filterControls}
      </div>

      {/* Desktop: original layout */}
      <div className="hidden md:flex items-center justify-between">
        <div className="ml-6">
          {isPublic ? (
            <div>
              <h2 className="text-md font-semibold">Public View</h2>
              <p className="text-sm text-muted-foreground">All Food+ Tracked Bills</p>
            </div>
          ) : (
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <Switch id="my-bills" checked={viewMode === 'all-bills'} onCheckedChange={toggleViewMode}> View All Bills</Switch>
                <Label htmlFor="my-bills" className="text-md">All Bills</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="show-archived" checked={showArchived} onCheckedChange={toggleShowArchived}> Show Archived</Switch>
                <Label htmlFor="show-archived" className="text-md">Show Archived</Label>
              </div>
            </div>
          )}
        </div>

        {/* Search — centered between switches and controls */}
        <div className="relative flex-1 max-w-md mx-6">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search bills..."
            className="pl-9"
            value={searchQuery}
            onChange={handleSearchChange}
            aria-label="Search bills"
          />
        </div>

        <div className="flex items-center space-x-2 mr-4 py-2">
          {filterControls}

          {!isPublic && (
            <>
              <TrackBillDialog />
              {canAddRemoveBills && <NewBillButton />}
              <ExportCsvDialog />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
