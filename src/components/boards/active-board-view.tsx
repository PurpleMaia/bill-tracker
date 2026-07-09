'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { TagFilterList } from '@/components/tags/tag-filter-list';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OrgSwitcherDropdown } from './org-switcher-dropdown';
import { ActiveBoardsBillsBridge } from './active-boards-bills-bridge';
import { useAuth } from '@/hooks/contexts/auth-context';
import { toast } from '@/hooks/use-toast';
import type { Bill, Tag } from '@/types/legislation';

export function ActiveBoardView() {
  const { followedOrgs, testimonyBillIds, bills } = useActiveBoards();
  const {
    searchQuery,
    setSearchQuery,
    selectedTagIds,
    setSelectedTagIds,
    selectedYears,
    setSelectedYears,
    deadFilter,
    setDeadFilter,
  } = useKanbanBoard();
  const { activeTenant } = useAuth();

  // Stable identity so the KanbanCard memo comparator (which now compares
  // onTrackForSelf) does not re-render every card on each parent render.
  const handleTrackForSelf = useCallback(
    async (bill: Bill) => {
      try {
        const res = await fetch('/api/bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: activeTenant?.tenantId, billUrl: bill.bill_url }),
        });
        if (!res.ok) throw new Error('Failed');
        toast({
          title: 'Bill tracked',
          description: `${bill.bill_number} added to your board.`,
          duration: 4000,
        });
      } catch {
        toast({
          title: 'Could not track bill',
          description: 'Please try again.',
          variant: 'destructive',
          duration: 5000,
        });
      }
    },
    [activeTenant?.tenantId],
  );

  // The viewed org's tags aren't fetched separately; the bridged bills already
  // carry them (correctly scoped, via getBoardAction), so derive the picker's
  // tag list from those instead of issuing a new query.
  const orgTags = useMemo(() => {
    const seen = new Map<string, Tag>();
    for (const b of bills) for (const t of (b.tags ?? [])) if (!seen.has(t.id)) seen.set(t.id, t);
    return Array.from(seen.values());
  }, [bills]);

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const handleYearToggle = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year],
    );
  };

  const clearFilters = () => {
    setSelectedTagIds([]);
    setSelectedYears([]);
    setDeadFilter('all');
  };

  if (followedOrgs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <LayoutGrid className="h-10 w-10" />
        <p className="text-base font-medium text-foreground">No followed boards</p>
        <p className="text-sm">Follow an organization to see their tracked bills here.</p>
        <Button asChild size="sm">
          <Link href="/boards/browse">Browse Orgs</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 p-2 md:p-4">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter this board…"
          className="h-9 max-w-xs"
        />
        {/* Read-only: no tag-management (admin-gated) and no archived/status
            filters here. Years and tags both derive from the bridged bills. */}
        <TagFilterList
          tags={orgTags}
          loadingTags={false}
          onTagsChanged={() => {}}
          selectedTagIds={selectedTagIds}
          onTagToggle={handleTagToggle}
          selectedYears={selectedYears}
          onYearToggle={handleYearToggle}
          deadFilter={deadFilter}
          onDeadFilterChange={setDeadFilter}
          onClearFilters={clearFilters}
          showStatusFilter={false}
          showArchivedFilter={false}
          showArchived={false}
          onShowArchivedChange={() => {}}
        />
        <div className="ml-auto">
          <OrgSwitcherDropdown />
        </div>
      </div>
      <ActiveBoardsBillsBridge>
        <KanbanBoard
          readOnly
          boardMode="active-boards"
          orgTestimonyBillIds={testimonyBillIds}
          onTrackForSelf={handleTrackForSelf}
        />
      </ActiveBoardsBillsBridge>
    </div>
  );
}
