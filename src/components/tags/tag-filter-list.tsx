'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, Filter, Check, Archive, SlidersHorizontal, Tags, Settings } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import type { Tag } from '@/types/legislation';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';

interface TagFilterListProps {
  tags: Tag[];
  loadingTags: boolean;
  /** Opens the Tags dialog (owned by the header). Org admins only. */
  onManageTags?: () => void;
  /**
   * Phones: one "Filters & tags" settings button (sliders icon) instead of
   * separate Filters and Tags buttons, so the Tags section gets its own
   * "Settings" button. Desktop has the Tags button beside Filters.
   */
  merged?: boolean;
  selectedTagIds: string[];
  onTagToggle: (tagId: string) => void;
  selectedYears: number[];
  onYearToggle: (year: number) => void;
  deadFilter: 'all' | 'dead' | 'alive';
  onDeadFilterChange: (value: 'all' | 'dead' | 'alive') => void;
  onClearFilters: () => void;
  /** Whether to show the dead/alive status filter (spreadsheet view only). */
  showStatusFilter?: boolean;
  /** Whether to show the archived toggle (logged-in users only). */
  showArchivedFilter?: boolean;
  showArchived: boolean;
  onShowArchivedChange: () => void;
  /**
   * Phones: the board search lives at the top of this panel (Trello-style)
   * instead of in the header. Pass the input here.
   */
  searchSlot?: React.ReactNode;
  /** Phones: the My Bills / org board toggle, under the search. */
  scopeSlot?: React.ReactNode;
  /** A search is active — counted in the badge, since the box is tucked away. */
  searchActive?: boolean;
  /** Extra classes for the Filters trigger (the phone toolbar slims it to pill height). */
  triggerClassName?: string;
}

/** Keyboard-operable option row used for the status, year, and tag lists. */
function FilterOptionRow({
  selected,
  onToggle,
  multiSelect = true,
  children,
}: {
  selected: boolean;
  onToggle: () => void;
  multiSelect?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      {...(multiSelect ? { role: 'checkbox', 'aria-checked': selected } : { 'aria-pressed': selected })}
      className={cn(
        'w-full flex items-center gap-2 p-2 rounded-md hover:bg-secondary cursor-pointer transition-colors text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <span className="flex items-center justify-center w-4 h-4 shrink-0">
        {selected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
      </span>
      {children}
    </button>
  );
}

export function TagFilterList({
  tags,
  loadingTags,
  onManageTags,
  merged = false,
  selectedTagIds,
  onTagToggle,
  selectedYears,
  onYearToggle,
  deadFilter,
  onDeadFilterChange,
  onClearFilters,
  showStatusFilter = false,
  showArchivedFilter = false,
  showArchived,
  onShowArchivedChange,
  searchSlot,
  scopeSlot,
  searchActive = false,
  triggerClassName,
}: TagFilterListProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { activeTenant } = useAuth();
  const { bills } = useBills();

  const canManageTags = activeTenant?.orgRole === 'admin' && !!onManageTags;

  const panelTitle = merged && canManageTags ? 'Filters & tags' : 'Filters';

  const openTags = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPopoverOpen(false);
    onManageTags?.();
  };
  // Tags are tenant-scoped; without a tenant the section is pure noise.
  const showTagsSection = !!activeTenant;

  // Extract unique years from bills
  const availableYears = React.useMemo(() => {
    const years = bills
      .map(bill => bill.year)
      .filter((year): year is number => year !== null && year !== undefined);
    return Array.from(new Set(years)).sort((a, b) => b - a); // Sort descending (newest first)
  }, [bills]);

  const archivedActive = showArchivedFilter && showArchived;
  const totalFiltersCount =
    selectedTagIds.length +
    selectedYears.length +
    (showStatusFilter && deadFilter !== 'all' ? 1 : 0) +
    (archivedActive ? 1 : 0) +
    (searchActive ? 1 : 0);

  const handleClearAll = () => {
    onClearFilters();
    if (archivedActive) {
      onShowArchivedChange();
    }
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label={panelTitle}
            className={cn(
              'shrink-0 gap-1 [&_svg]:size-[18px]',
              // Phones: the one settings button for filters + tags, solid like a primary action.
              merged
                ? 'border-olive-dark bg-olive-dark text-white hover:bg-olive-dark/90 hover:text-white'
                : 'bg-white text-foreground hover:bg-secondary hover:text-foreground',
              triggerClassName
            )}
          >
            {merged ? <SlidersHorizontal className="sm:mr-1" /> : <Filter className="sm:mr-1" />}
            <span className="hidden sm:inline">Filters</span>
            {totalFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 sm:ml-2 h-5 px-1.5">
                {totalFiltersCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{panelTitle}</h3>
              <div className="flex gap-1">
                {totalFiltersCount > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearAll();
                    }}
                    className="h-7 text-xs"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear All
                  </Button>
                )}
              </div>
            </div>

            {searchSlot}
            {scopeSlot}

            <div className="space-y-4">
              {/* Archived Section (logged-in users only) */}
              {showArchivedFilter && (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Archive className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium leading-tight">Include archived</p>
                      <p className="text-xs text-muted-foreground">Show archived bills on the board</p>
                    </div>
                  </div>
                  <Switch
                    checked={showArchived}
                    onCheckedChange={onShowArchivedChange}
                    aria-label="Include archived bills"
                  />
                </div>
              )}

              {/* Dead/Alive Status Section (spreadsheet view only) */}
              {showStatusFilter && (
                <div className={showArchivedFilter ? 'pt-2 border-t' : ''}>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">STATUS</h4>
                  <div className="space-y-1">
                    {(['all', 'alive', 'dead'] as const).map((value) => {
                      const label = value === 'all' ? 'All Bills' : value === 'alive' ? 'Active' : 'Failed';
                      return (
                        <FilterOptionRow
                          key={value}
                          selected={deadFilter === value}
                          onToggle={() => onDeadFilterChange(value)}
                          multiSelect={false}
                        >
                          <span className="flex items-center gap-1.5">
                            {value === 'dead' && <span className="h-2 w-2 rounded-full bg-red-500 inline-block" aria-hidden="true" />}
                            {value === 'alive' && <span className="h-2 w-2 rounded-full bg-green-500 inline-block" aria-hidden="true" />}
                            <span className="text-sm">{label}</span>
                          </span>
                        </FilterOptionRow>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Years Section */}
              {availableYears.length > 0 && (
                <div className={showArchivedFilter || showStatusFilter ? 'pt-2 border-t' : ''}>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">YEAR</h4>
                  <div className="max-h-[150px] overflow-y-auto space-y-1">
                    {availableYears.map((year) => (
                      <FilterOptionRow
                        key={year}
                        selected={selectedYears.includes(year)}
                        onToggle={() => onYearToggle(year)}
                      >
                        <span className="text-sm">{year}</span>
                      </FilterOptionRow>
                    ))}
                  </div>
                  {selectedYears.length > 0 && (
                    <p className="text-xs text-muted-foreground pt-2">
                      {selectedYears.length} year{selectedYears.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              {/* Tags Section (tenant-scoped) */}
              {showTagsSection && (
                <div className={availableYears.length > 0 || showArchivedFilter || showStatusFilter ? 'pt-2 border-t' : ''}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-muted-foreground">TAGS</h4>
                    {canManageTags && merged && (
                      <Button size="sm" variant="ghost" onClick={openTags} aria-label="Tags settings" className="h-7 -mr-2 text-xs">
                        <Settings className="h-3.5 w-3.5" />
                        Settings
                      </Button>
                    )}
                  </div>
                  {loadingTags ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Loading tags...
                    </p>
                  ) : tags.length === 0 ? (
                    <div className="py-4 space-y-2">
                      <p className="text-sm text-muted-foreground text-center">
                        No tags available.
                      </p>
                      {canManageTags && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={openTags}
                          className="w-full"
                        >
                          <Tags className="h-4 w-4 mr-2" />
                          Create Tags
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {tags.map((tag) => (
                          <FilterOptionRow
                            key={tag.id}
                            selected={selectedTagIds.includes(tag.id)}
                            onToggle={() => onTagToggle(tag.id)}
                          >
                            <Badge
                              variant="outline"
                              style={{
                                backgroundColor: tag.color || '#3b82f6',
                                color: 'white',
                                borderColor: tag.color || '#3b82f6',
                              }}
                              className="text-xs"
                            >
                              {tag.name}
                            </Badge>
                          </FilterOptionRow>
                        ))}
                      </div>
                      {selectedTagIds.length > 0 && (
                        <p className="text-xs text-muted-foreground pt-2">
                          {selectedTagIds.length} tag{selectedTagIds.length !== 1 ? 's' : ''} selected
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

    </>
  );
}
