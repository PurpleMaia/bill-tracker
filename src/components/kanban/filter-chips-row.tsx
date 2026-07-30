'use client';

import { badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/core/utils';
import { Archive, X } from 'lucide-react';
import type { Tag } from '@/types/legislation';

interface FilterChipsRowProps {
  tags: Tag[];
  selectedTagIds: string[];
  onTagToggle: (tagId: string) => void;
  selectedYears: number[];
  onYearToggle: (year: number) => void;
  deadFilter: 'all' | 'dead' | 'alive';
  onDeadFilterChange: (value: 'all' | 'dead' | 'alive') => void;
  showArchived: boolean;
  onShowArchivedChange: () => void;
  onClearAll: () => void;
}

function Chip({
  onRemove,
  removeLabel,
  className,
  style,
  children,
}: {
  onRemove: () => void;
  removeLabel: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={removeLabel}
      style={style}
      className={cn(badgeVariants({ variant: 'default' }), 'cursor-pointer hover:opacity-80', className)}
    >
      {children}
      <X className="h-3 w-3 ml-1" aria-hidden="true" />
    </button>
  );
}

/**
 * Slim strip under the kanban header showing every active filter as a
 * dismissible chip, so board state stays visible without opening the popover.
 * Collapses (animated) when no filters are active.
 */
export function FilterChipsRow({
  tags,
  selectedTagIds,
  onTagToggle,
  selectedYears,
  onYearToggle,
  deadFilter,
  onDeadFilterChange,
  showArchived,
  onShowArchivedChange,
  onClearAll,
}: FilterChipsRowProps) {
  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));
  const hasFilters =
    selectedTags.length > 0 || selectedYears.length > 0 || deadFilter !== 'all' || showArchived;

  return (
    <div
      aria-hidden={!hasFilters}
      className={cn(
        'grid transition-[grid-template-rows] duration-150 ease-out motion-reduce:transition-none',
        hasFilters ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
    >
      <div className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-t bg-muted/50">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-1">
            Filtered by
          </span>

          {selectedTags.map((tag) => (
            <Chip
              key={tag.id}
              onRemove={() => onTagToggle(tag.id)}
              removeLabel={`Remove ${tag.name} filter`}
              style={{ backgroundColor: tag.color || '#3b82f6', color: 'white' }}
            >
              {tag.name}
            </Chip>
          ))}

          {selectedYears.map((year) => (
            <Chip
              key={year}
              onRemove={() => onYearToggle(year)}
              removeLabel={`Remove ${year} filter`}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              {year}
            </Chip>
          ))}

          {deadFilter !== 'all' && (
            <Chip
              onRemove={() => onDeadFilterChange('all')}
              removeLabel={`Remove ${deadFilter === 'dead' ? 'failed' : 'active'} bills filter`}
              className="bg-transparent text-foreground"
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full inline-block mr-1',
                  deadFilter === 'dead' ? 'bg-red-500' : 'bg-green-500'
                )}
                aria-hidden="true"
              />
              {deadFilter === 'dead' ? 'Failed bills' : 'Active bills'}
            </Chip>
          )}

          {showArchived && (
            <Chip
              onRemove={onShowArchivedChange}
              removeLabel="Stop including archived bills"
              className="border-dashed border-input bg-transparent text-muted-foreground"
            >
              <Archive className="h-3 w-3 mr-1" aria-hidden="true" />
              Archived included
            </Chip>
          )}

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="h-6 px-2 text-xs text-muted-foreground"
            >
              Clear all
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
