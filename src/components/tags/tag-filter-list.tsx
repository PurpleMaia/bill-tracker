'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, Settings, Filter, Check, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tag } from '@/types/legislation';
import { TagManagementDialog } from './tag-management-dialog';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';

interface TagFilterListProps {
  tags: Tag[];
  loadingTags: boolean;
  /** Called after the tag management dialog closes so the owner can refetch. */
  onTagsChanged: () => void;
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
  onTagsChanged,
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
}: TagFilterListProps) {
  const [showManagementDialog, setShowManagementDialog] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { activeTenant } = useAuth();
  const { bills } = useBills();

  const canManageTags = activeTenant?.orgRole === 'admin';
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
    (archivedActive ? 1 : 0);

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
          <Button variant="outline" aria-label="Filters" className="shrink-0">
            <Filter className="h-4 w-4 sm:mr-2" />
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
              <h3 className="text-sm font-semibold">Filters</h3>
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
                {canManageTags && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Manage tags"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowManagementDialog(true);
                      setPopoverOpen(false);
                    }}
                    className="h-7 text-xs"
                  >
                    <Settings className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

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
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">TAGS</h4>
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
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowManagementDialog(true);
                            setPopoverOpen(false);
                          }}
                          className="w-full"
                        >
                          <Settings className="h-4 w-4 mr-2" />
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

      <TagManagementDialog
        isOpen={showManagementDialog}
        onClose={() => {
          setShowManagementDialog(false);
          onTagsChanged();
        }}
      />
    </>
  );
}
