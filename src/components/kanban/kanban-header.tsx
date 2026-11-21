'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
// LEGACY: NewBillButton ("Manage Bills") — from when AI was used to bulk-add
// certain types of bills to an org's liking. We are not implementing this
// feature further; left commented out rather than deleted.
// import NewBillButton from './new-bill/new-bill-button';
import { KanbanPillStrip } from './kanban-pill-strip';
import { ViewScopeToggle } from './view-scope-toggle';
import { FilterChipsRow } from './filter-chips-row';
import { useBills } from '@/hooks/contexts/bills-context';
import { useTrack } from '@/hooks/use-track';
import { searchBillsLocal } from '@/lib/bills/bill-search';
import { TrackBillDialog } from './track-bill-dialog';
import { TagFilterList } from '../tags/tag-filter-list';
import { TagsDialog } from '../tags/tags-dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Globe, Search, Tags, UserPlus } from 'lucide-react';
import { getTagsAction } from '@/app/actions/tags';
import type { Tag } from '@/types/legislation';

interface KanbanHeaderProps {
  /**
   * 'own' (default): the normal board header — ViewScopeToggle + Track / New /
   * Export cluster, tags loaded for the viewer's active tenant.
   * 'active-boards': read-only header for viewing another org's board — no
   * action cluster (the org identity + switcher live in ActiveBoardBanner
   * above), and tags are derived from the bills already in context.
   */
  variant?: 'own' | 'active-boards';
}

export function KanbanHeader({ variant = 'own' }: KanbanHeaderProps) {
  const { user, activeTenant } = useAuth();
  const { showArchived, toggleShowArchived, bills } = useBills();
  const { view, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears, deadFilter, setDeadFilter, searchQuery, setSearchQuery, scrollToPhase, phaseScrollAvailable } = useKanbanBoard();

  const isActiveBoards = variant === 'active-boards';
  // Active Boards is a read-only view of another org's board: no public branch,
  // no Track/New/Export, no archived toggle.
  const isPublic = !isActiveBoards && !user;
  // LEGACY: gated the "Manage Bills" button (see the commented-out render below).
  // const canAddRemoveBills = !isActiveBoards && activeTenant?.orgRole === 'admin';

  // Tag state lives here so both the filter popover and the chips row share it.
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  // One Tags dialog (create/edit + bulk tag) for org admins on their own board.
  const canManageTags = !isActiveBoards && activeTenant?.orgRole === 'admin';
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  // Spreadsheet and calendar have no column footers to track from.
  const showHeaderTrack = !isActiveBoards && !isPublic && (view === 'spreadsheet' || view === 'calendar');

  const loadTags = useCallback(async () => {
    if (!activeTenant) {
      setTags([]);
      return;
    }
    setLoadingTags(true);
    try {
      setTags(await getTagsAction({ tenantId: activeTenant.tenantId }));
    } catch (error) {
      console.error('Failed to load tags:', error);
    } finally {
      setLoadingTags(false);
    }
  }, [activeTenant]);

  // In active-boards mode the tags aren't fetched for the viewer's tenant; the
  // bills in context already carry the viewed org's tags (scoped by getBoardAction).
  const activeBoardsTags = useMemo(() => {
    if (!isActiveBoards) return [];
    const seen = new Map<string, Tag>();
    for (const b of bills) for (const t of (b.tags ?? [])) if (!seen.has(t.id)) seen.set(t.id, t);
    return Array.from(seen.values());
  }, [isActiveBoards, bills]);

  useEffect(() => {
    if (isActiveBoards) return; // tags come from bills, not a fetch
    loadTags();
  }, [isActiveBoards, loadTags]);

  const effectiveTags = isActiveBoards ? activeBoardsTags : tags;

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

  // One bill_search event per distinct query the user typed, once typing has
  // settled. Only typed queries count — a query restored from storage on mount
  // is not a new search.
  const track = useTrack();
  const userTypedRef = useRef(false);
  const lastTrackedQuery = useRef<string | null>(null);
  useEffect(() => {
    const q = searchQuery.trim();
    if (!userTypedRef.current || !q || lastTrackedQuery.current === q) return;
    const timer = setTimeout(() => {
      lastTrackedQuery.current = q;
      track('bill_search', { query: q, resultCount: searchBillsLocal(bills, q).length });
    }, 1000);
    return () => clearTimeout(timer);
  }, [searchQuery, bills, track]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    userTypedRef.current = true;
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

  // Chips-row variant also resets archived (the popover handles that itself)
  // and the search: on phones the search box is tucked inside the Filters
  // panel, so leaving it would keep the board narrowed by a query nobody can
  // see once the chips are gone. On desktop it's "all" too, in plain view.
  const clearAllFilters = () => {
    clearPopoverFilters();
    setSearchQuery('');
    if (!isPublic && showArchived) {
      toggleShowArchived();
    }
  };

  // Phones put the search inside the filter panel, so its Clear All clears the
  // search too (desktop's search box sits in plain view and keeps its own).
  const clearMobileFilters = () => {
    clearPopoverFilters();
    setSearchQuery('');
  };

  const renderFilterControls = (mobile: boolean) => (
    <TagFilterList
      tags={effectiveTags}
      loadingTags={isActiveBoards ? false : loadingTags}
      onManageTags={canManageTags ? () => setTagsDialogOpen(true) : undefined}
      merged={mobile}
      selectedTagIds={selectedTagIds}
      onTagToggle={handleTagToggle}
      selectedYears={selectedYears}
      onYearToggle={handleYearToggle}
      deadFilter={deadFilter}
      onDeadFilterChange={setDeadFilter}
      showStatusFilter={!isActiveBoards && view === 'spreadsheet'}
      showArchivedFilter={!isActiveBoards && !isPublic}
      showArchived={showArchived}
      onShowArchivedChange={toggleShowArchived}
      onClearFilters={mobile ? clearMobileFilters : clearPopoverFilters}
      searchSlot={mobile ? renderSearchInput(mobileSearchRef, false) : undefined}
      scopeSlot={mobile && !isActiveBoards && activeTenant ? (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">VIEWING</h4>
          <ViewScopeToggle className="w-full [&>button]:min-w-0 [&>button]:flex-1 [&>button]:justify-center" />
        </div>
      ) : undefined}
      searchActive={mobile && searchQuery.trim() !== ''}
      triggerClassName={mobile ? 'h-8 px-2.5' : undefined}
    />
  );

  // `desktop` adds the ⌘K hint and the full placeholder; the phone copy lives
  // in the narrow filter panel, where only a short placeholder fits.
  const renderSearchInput = (ref: React.RefObject<HTMLInputElement>, desktop: boolean) => (
    <div className="relative flex-1 max-w-xl">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input
        ref={ref}
        type="search"
        placeholder={desktop ? 'Search bills by number, title, or keyword...' : 'Bill number, title, or keyword'}
        className={desktop ? 'pl-9 pr-16' : 'pl-9'}
        value={searchQuery}
        onChange={handleSearchChange}
        aria-label="Search bills"
      />
      {desktop && (
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {shortcutHint}
        </kbd>
      )}
    </div>
  );

  return (
    <div className="border-b bg-white shadow-md">
      {/* Mobile: one Trello-style toolbar row — phase jump pills, then
          Filters pinned right (search lives inside its panel). Tracking lives
          in each column's footer; spreadsheet and calendar have no columns
          (and no pills), so Track Bill takes that slot there. Export is in
          the avatar menu. */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          {phaseScrollAvailable && <KanbanPillStrip onScrollTo={scrollToPhase} />}
          {showHeaderTrack && (
            <TrackBillDialog>
              <Button size="sm" className="h-8 px-2.5">
                <UserPlus /> Track Bill
              </Button>
            </TrackBillDialog>
          )}
        </div>
        {renderFilterControls(true)}
      </div>

      {/* Desktop */}
      <div className="hidden md:flex items-center gap-4 p-2 px-4">
        {!isActiveBoards &&
          (isPublic ? (
            <div className="flex items-center gap-2 shrink-0">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div className="leading-tight">
                <h2 className="text-sm font-semibold">Public View</h2>
                <p className="text-xs text-muted-foreground">All Food+ Tracked Bills</p>
              </div>
            </div>
          ) : (
            <ViewScopeToggle className="shrink-0" />
          ))}

        {/* Find group: search + filters narrow the same result set */}
        <div className="flex items-center gap-2 flex-1">
          {renderSearchInput(desktopSearchRef, true)}
          {renderFilterControls(false)}
        </div>

        {/* Action group, pinned right. Tags changes the org's data rather than
            narrowing the view, so it sits apart from search + filters. Track
            Bill only shows where there are no kanban columns (spreadsheet,
            calendar): on the board, each column's footer is the track action. */}
        {(canManageTags || showHeaderTrack) && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {showHeaderTrack && <TrackBillDialog />}
            {canManageTags && (
              <Button
                onClick={() => setTagsDialogOpen(true)}
                className="shrink-0 gap-1 [&_svg]:size-[18px] bg-olive-dark text-white hover:bg-olive-dark/90 hover:text-white"
              >
                <Tags className='mr-1 h-12 w-12' />
                Tags
              </Button>
            )}
          </div>
        )}

        {/* No header Export button: export lives in the avatar menu, the same
            on desktop and phones. */}
        {/* LEGACY FEATURE — "Manage Bills" button. This dates from when AI
            was used to add certain types of bills to an org's liking. We are
            not implementing this feature further, so it's hidden for now. */}
        {/* {canAddRemoveBills && <NewBillButton />} */}
      </div>

      <FilterChipsRow
        tags={effectiveTags}
        selectedTagIds={selectedTagIds}
        onTagToggle={handleTagToggle}
        selectedYears={selectedYears}
        onYearToggle={handleYearToggle}
        deadFilter={!isActiveBoards && view === 'spreadsheet' ? deadFilter : 'all'}
        onDeadFilterChange={setDeadFilter}
        showArchived={!isActiveBoards && !isPublic && showArchived}
        onShowArchivedChange={toggleShowArchived}
        onClearAll={clearAllFilters}
      />

      {canManageTags && (
        <TagsDialog
          isOpen={tagsDialogOpen}
          onClose={() => {
            setTagsDialogOpen(false);
            loadTags(); // new/renamed tags show up in Filters and the chips row
          }}
        />
      )}
    </div>
  );
}
