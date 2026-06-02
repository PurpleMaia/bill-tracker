'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, Settings, Filter, Check } from 'lucide-react';
import { getAllTags } from '@/services/data/tags';
import type { Tag } from '@/types/legislation';
import { TagManagementDialog } from './tag-management-dialog';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';

interface TagFilterListProps {
  selectedTagIds: string[];
  onTagToggle: (tagId: string) => void;
  selectedYears: number[];
  onYearToggle: (year: number) => void;
  deadFilter: 'all' | 'dead' | 'alive';
  onDeadFilterChange: (value: 'all' | 'dead' | 'alive') => void;
  onClearFilters: () => void;
}

export function TagFilterList({
  selectedTagIds,
  onTagToggle,
  selectedYears,
  onYearToggle,
  deadFilter,
  onDeadFilterChange,
  onClearFilters,
}: TagFilterListProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [showManagementDialog, setShowManagementDialog] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { user, activeTenant } = useAuth();
  const { bills } = useBills();

  const canManageTags = activeTenant?.orgRole === 'admin';

  // Extract unique years from bills
  const availableYears = React.useMemo(() => {
    const years = bills
      .map(bill => bill.year)
      .filter((year): year is number => year !== null && year !== undefined);
    return Array.from(new Set(years)).sort((a, b) => b - a); // Sort descending (newest first)
  }, [bills]);

  useEffect(() => {
    loadTags();
  }, [activeTenant]);

  const loadTags = async () => {
    setLoading(true);
    try {
      if (!activeTenant) {
        setTags([]);
        return;
      }
      const fetchedTags = await getAllTags(activeTenant.tenantId);
      setTags(fetchedTags);
    } catch (error) {
      console.error('Failed to load tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedTags = tags.filter(tag => selectedTagIds.includes(tag.id));
  const totalFiltersCount = selectedTagIds.length + selectedYears.length + (deadFilter !== 'all' ? 1 : 0);

  return (
    <>
      <div className="flex items-center gap-2">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {totalFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                  {totalFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
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
                        onClearFilters();
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

              {loading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Loading filters...
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Dead/Alive Status Section */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">STATUS</h4>
                    <div className="space-y-1">
                      {(['all', 'alive', 'dead'] as const).map((value) => {
                        const isSelected = deadFilter === value;
                        const label = value === 'all' ? 'All Bills' : value === 'alive' ? 'Alive' : 'Dead';
                        return (
                          <div
                            key={value}
                            onClick={() => onDeadFilterChange(value)}
                            className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer transition-colors"
                          >
                            <div className="flex items-center justify-center w-4 h-4">
                              {isSelected && <Check className="h-4 w-4 text-primary" />}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {value === 'dead' && <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />}
                              {value === 'alive' && <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />}
                              <span className="text-sm">{label}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Years Section */}
                  {availableYears.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">YEAR</h4>
                      <div className="max-h-[150px] overflow-y-auto space-y-1">
                        {availableYears.map((year) => {
                          const isSelected = selectedYears.includes(year);
                          return (
                            <div
                              key={year}
                              onClick={() => onYearToggle(year)}
                              className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer transition-colors"
                            >
                              <div className="flex items-center justify-center w-4 h-4">
                                {isSelected && <Check className="h-4 w-4 text-primary" />}
                              </div>
                              <span className="text-sm">{year}</span>
                            </div>
                          );
                        })}
                      </div>
                      {selectedYears.length > 0 && (
                        <p className="text-xs text-muted-foreground pt-2">
                          {selectedYears.length} year{selectedYears.length !== 1 ? 's' : ''} selected
                        </p>
                      )}
                    </div>
                  )}

                  {/* Tags Section */}
                  <div className={availableYears.length > 0 ? 'pt-2 border-t' : ''}>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">TAGS</h4>
                    {tags.length === 0 ? (
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
                          {tags.map((tag) => {
                            const isSelected = selectedTagIds.includes(tag.id);
                            return (
                              <div
                                key={tag.id}
                                onClick={() => onTagToggle(tag.id)}
                                className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer transition-colors"
                              >
                                <div className="flex items-center justify-center w-4 h-4">
                                  {isSelected && <Check className="h-4 w-4 text-primary" />}
                                </div>
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
                              </div>
                            );
                          })}
                        </div>
                        {selectedTagIds.length > 0 && (
                          <p className="text-xs text-muted-foreground pt-2">
                            {selectedTagIds.length} tag{selectedTagIds.length !== 1 ? 's' : ''} selected
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Show selected tags outside the popover */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedTags.map((tag) => (
              <Badge
                key={tag.id}
                variant="default"
                style={{
                  backgroundColor: tag.color || '#3b82f6',
                  color: 'white',
                }}
                className="cursor-pointer hover:opacity-80"
                onClick={() => onTagToggle(tag.id)}
              >
                {tag.name}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
      </div>

      <TagManagementDialog
        isOpen={showManagementDialog}
        onClose={() => {
          setShowManagementDialog(false);
          loadTags();
        }}
      />
    </>
  );
}