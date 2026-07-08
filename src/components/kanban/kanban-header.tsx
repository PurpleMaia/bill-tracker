'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import NewBillButton from './new-bill/new-bill-button';
import { TrackBillDialog } from './track-bill-dialog';
import { ExportCsvDialog } from './export-csv-dialog';
import { ViewScopeToggle } from './view-scope-toggle';
import { FilterChipsRow } from './filter-chips-row';
import { useBills } from '@/hooks/contexts/bills-context';
import { TagFilterList } from '../tags/tag-filter-list';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Download, Globe, Search, UserPlus } from 'lucide-react';
import { getAllTags } from '@/db/queries/tags';
import type { Tag } from '@/types/legislation';

export function KanbanHeader() {
  const { user, activeTenant } = useAuth();
  const { showArchived, toggleShowArchived } = useBills();
  const { view, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears, deadFilter, setDeadFilter, searchQuery, setSearchQuery } = useKanbanBoard();

  const isPublic = !user;
  const canAddRemoveBills = activeTenant?.orgRole === 'admin';

  // Tag state lives here so both the filter popover and the chips row share it.
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  const loadTags = useCallback(async () => {
    if (!activeTenant) {
      setTags([]);
      return;
    }
    setLoadingTags(true);
    try {
      setTags(await getAllTags(activeTenant.tenantId));
    } catch (error) {
      console.error('Failed to load tags:', error);
    } finally {
      setLoadingTags(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // Keyboard shortcut: Cmd/Ctrl+K (anywhere) or "/" (outside a field)
  // focuses whichever search input is visible at the current breakpoint.
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const [shortcutHint, setShortcutHint] = useState('⌘K');

  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) {
      setShortcutHint('Ctrl K');
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const isSlash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!isCmdK && !isSlash) return;

      const target = event.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isSlash && inField) return;

      const visible = [desktopSearchRef.current, mobileSearchRef.current].find(
        (el) => el && el.offsetParent !== null
      );
      if (visible) {
        event.preventDefault();
        visible.focus();
        visible.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleYearToggle = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year)
        ? prev.filter((y) => y !== year)
        : [...prev, year]
    );
  };

  const clearPopoverFilters = () => {
    setSelectedTagIds([]);
    setSelectedYears([]);
    setDeadFilter('all');
  };

  // Chips-row variant also resets archived (the popover handles that itself).
  const clearAllFilters = () => {
    clearPopoverFilters();
    if (!isPublic && showArchived) {
      toggleShowArchived();
    }
  };

  const filterControls = (
    <TagFilterList
      tags={tags}
      loadingTags={loadingTags}
      onTagsChanged={loadTags}
      selectedTagIds={selectedTagIds}
      onTagToggle={handleTagToggle}
      selectedYears={selectedYears}
      onYearToggle={handleYearToggle}
      deadFilter={deadFilter}
      onDeadFilterChange={setDeadFilter}
      showStatusFilter={view === 'spreadsheet'}
      showArchivedFilter={!isPublic}
      showArchived={showArchived}
      onShowArchivedChange={toggleShowArchived}
      onClearFilters={clearPopoverFilters}
    />
  );

  const renderSearchInput = (ref: React.RefObject<HTMLInputElement>, withHint: boolean) => (
    <div className="relative flex-1 max-w-xl">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input
        ref={ref}
        type="search"
        placeholder="Search bills by number, title, or keyword..."
        className={withHint ? 'pl-9 pr-16' : 'pl-9'}
        value={searchQuery}
        onChange={handleSearchChange}
        aria-label="Search bills"
      />
      {withHint && (
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {shortcutHint}
        </kbd>
      )}
    </div>
  );

  return (
    <div className="border-b bg-white shadow-md">
      {/* Mobile: search + filter + export row */}
      <div className="md:hidden flex items-center gap-2 p-2 px-4">
        {renderSearchInput(mobileSearchRef, false)}
        {filterControls}
        {!isPublic && (
          <>
            <TrackBillDialog>
              <Button size="icon" className="shrink-0" aria-label="Track a new bill">
                <UserPlus className="h-4 w-4" />
              </Button>
            </TrackBillDialog>
            <ExportCsvDialog>
              <Button variant="outline" size="icon" className="shrink-0" aria-label="Export bills (CSV or Excel)">
                <Download className="h-4 w-4" />
              </Button>
            </ExportCsvDialog>
          </>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden md:flex items-center gap-4 p-2 px-4">
        {isPublic ? (
          <div className="flex items-center gap-2 shrink-0">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="leading-tight">
              <h2 className="text-sm font-semibold">Public View</h2>
              <p className="text-xs text-muted-foreground">All Food+ Tracked Bills</p>
            </div>
          </div>
        ) : (
          <ViewScopeToggle className="shrink-0" />
        )}

        {/* Find group: search + filters narrow the same result set */}
        <div className="flex items-center gap-2 flex-1">
          {renderSearchInput(desktopSearchRef, true)}
          {filterControls}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {!isPublic && (
            <>
              <TrackBillDialog />
              {canAddRemoveBills && <NewBillButton />}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <ExportCsvDialog>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" aria-label="Export bills (CSV or Excel)">
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                  </ExportCsvDialog>
                  <TooltipContent>Export bills (CSV / Excel)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>

      <FilterChipsRow
        tags={tags}
        selectedTagIds={selectedTagIds}
        onTagToggle={handleTagToggle}
        selectedYears={selectedYears}
        onYearToggle={handleYearToggle}
        deadFilter={view === 'spreadsheet' ? deadFilter : 'all'}
        onDeadFilterChange={setDeadFilter}
        showArchived={!isPublic && showArchived}
        onShowArchivedChange={toggleShowArchived}
        onClearAll={clearAllFilters}
      />
    </div>
  );
}
