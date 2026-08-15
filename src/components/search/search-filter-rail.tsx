'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SIMPLIFIED_COLUMNS } from '@/lib/bills/kanban-columns';
import {
  activeFilterCount,
  type Chamber,
  type DeadFilter,
  type SearchFilters,
} from '@/lib/bills/search-params';

const YEARS = [2026, 2025];

// SIMPLIFIED_COLUMNS (from @/lib/bills/kanban-columns) is shared with the kanban
// board, where two entries ('simpleScheduled' and 'conferenceScheduled') share the
// identical title 'SCHEDULED'. On the board that's unambiguous because position
// (pre-crossover vs. conference group) supplies the context. Here the Stage filter
// renders them as a flat checkbox list with no such context, so without an override
// they'd show as two identical "scheduled" checkboxes. Do not delete this as
// redundant with column.title — it exists to disambiguate ids that share a title.
const STAGE_LABEL_OVERRIDES: Record<string, string> = {
  simpleScheduled: 'scheduled',
  conferenceScheduled: 'conference scheduled',
};

interface SearchFilterRailProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  onClear: () => void;
}

/**
 * Filter controls, shared verbatim by the desktop rail and the mobile sheet so
 * the two can never drift. Uses real fieldset/legend + checkbox/radio elements,
 * which are keyboard-navigable and screen-reader-labeled by default.
 */
export function SearchFilterRail({ filters, onChange, onClear }: SearchFilterRailProps) {
  const toggleYear = (year: number) => {
    const years = filters.years.includes(year)
      ? filters.years.filter((y) => y !== year)
      : [...filters.years, year];
    onChange({ ...filters, years });
  };

  const toggleChamber = (chamber: Chamber) => {
    const chambers = filters.chambers.includes(chamber)
      ? filters.chambers.filter((c) => c !== chamber)
      : [...filters.chambers, chamber];
    onChange({ ...filters, chambers });
  };

  const toggleStage = (stageId: string) => {
    const stages = filters.stages.includes(stageId)
      ? filters.stages.filter((s) => s !== stageId)
      : [...filters.stages, stageId];
    onChange({ ...filters, stages });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Filters
        </h2>
        {activeFilterCount(filters) > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-auto p-1 text-xs">
            Clear all
          </Button>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Session</legend>
        {YEARS.map((year) => (
          <div key={year} className="flex items-center gap-2">
            <Checkbox
              id={`year-${year}`}
              checked={filters.years.includes(year)}
              onCheckedChange={() => toggleYear(year)}
            />
            <Label htmlFor={`year-${year}`} className="cursor-pointer text-sm font-normal">
              {year}
            </Label>
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Chamber</legend>
        {(['house', 'senate'] as Chamber[]).map((chamber) => (
          <div key={chamber} className="flex items-center gap-2">
            <Checkbox
              id={`chamber-${chamber}`}
              checked={filters.chambers.includes(chamber)}
              onCheckedChange={() => toggleChamber(chamber)}
            />
            <Label htmlFor={`chamber-${chamber}`} className="cursor-pointer text-sm font-normal capitalize">
              {chamber}
            </Label>
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Status</legend>
        <RadioGroup
          value={filters.deadFilter}
          onValueChange={(value) => onChange({ ...filters, deadFilter: value as DeadFilter })}
        >
          {(['all', 'alive', 'dead'] as DeadFilter[]).map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem value={value} id={`dead-${value}`} />
              <Label htmlFor={`dead-${value}`} className="cursor-pointer text-sm font-normal capitalize">
                {value === 'all' ? 'All bills' : value}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Stage</legend>
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            {filters.stages.length > 0 ? `${filters.stages.length} selected` : 'Any stage'}
          </summary>
          <div className="mt-2 space-y-2">
            {SIMPLIFIED_COLUMNS.map((column) => (
              <div key={column.id} className="flex items-center gap-2">
                <Checkbox
                  id={`stage-${column.id}`}
                  checked={filters.stages.includes(column.id)}
                  onCheckedChange={() => toggleStage(column.id)}
                />
                <Label
                  htmlFor={`stage-${column.id}`}
                  className="cursor-pointer text-xs font-normal capitalize"
                >
                  {STAGE_LABEL_OVERRIDES[column.id] ?? column.title.toLowerCase()}
                </Label>
              </div>
            ))}
          </div>
        </details>
      </fieldset>
    </div>
  );
}
