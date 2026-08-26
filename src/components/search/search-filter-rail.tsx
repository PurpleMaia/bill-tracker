'use client';

import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SIMPLIFIED_COLUMNS } from '@/lib/bills/kanban-columns';
import { stageLabel } from '@/lib/bills/stage-labels';
import {
  activeFilterCount,
  type Chamber,
  type DeadFilter,
  type SearchFilters,
  type TrackedFilter,
} from '@/lib/bills/search-params';

const YEARS = [2026, 2025];

const TRACKED_OPTIONS: { value: TrackedFilter; label: string }[] = [
  { value: 'all', label: 'All bills' },
  { value: 'tracked', label: 'Tracked' },
  { value: 'untracked', label: 'Not tracked' },
];

interface SearchFilterRailProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  onClear: () => void;
  /** Tracked/not-tracked is user-scoped — disabled with a hint when logged out. */
  loggedIn: boolean;
}

/**
 * Filter controls, shared verbatim by the desktop rail and the mobile sheet so
 * the two can never drift. Uses real fieldset/legend + checkbox/radio elements,
 * which are keyboard-navigable and screen-reader-labeled by default.
 */
export function SearchFilterRail({ filters, onChange, onClear, loggedIn }: SearchFilterRailProps) {
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
        <legend className="mb-2 text-sm font-medium">Tracking</legend>
        {/* User-scoped: a logged-out visitor has no tracked set, so the control
            is disabled and a hover tooltip says why rather than silently doing
            nothing. Kept visible (not hidden) so the capability is discoverable. */}
        {loggedIn ? (
          <TrackingRadioGroup filters={filters} onChange={onChange} disabled={false} />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-not-allowed">
                <TrackingRadioGroup filters={filters} onChange={onChange} disabled />
              </div>
            </TooltipTrigger>
            <TooltipContent>Sign in to filter by tracked bills</TooltipContent>
          </Tooltip>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <div className="mb-2 flex items-center justify-between">
          <legend className="text-sm font-medium">Stage</legend>
          {filters.stages.length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, stages: [] })}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Reset
            </button>
          )}
        </div>
        {/*
          A dropdown rather than an inline list. 13 stages inline made the rail
          taller than its pane, and a nested scroll region inside an already
          scrolling rail was confusing to operate. The popover keeps the rail
          short and puts the long list in a surface of its own.
        */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="h-9 w-full justify-between px-3 text-xs font-normal"
            >
              <span className="truncate">
                {filters.stages.length === 0
                  ? 'Any stage'
                  : filters.stages.length === 1
                    ? stageLabel(filters.stages[0])
                    : `${filters.stages.length} stages`}
              </span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[15rem] p-1.5">
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {SIMPLIFIED_COLUMNS.map((column) => (
                <label
                  key={column.id}
                  htmlFor={`stage-${column.id}`}
                  className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
                >
                  <Checkbox
                    id={`stage-${column.id}`}
                    className="mt-0.5 shrink-0"
                    checked={filters.stages.includes(column.id)}
                    onCheckedChange={() => toggleStage(column.id)}
                  />
                  <span className="text-xs capitalize leading-tight">
                    {stageLabel(column.id)}
                  </span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </fieldset>
    </div>
  );
}

/** The tracked/not-tracked radio group, shared by the enabled and disabled
    (tooltip-wrapped) branches so the markup can't drift between them. */
function TrackingRadioGroup({
  filters,
  onChange,
  disabled,
}: {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  disabled: boolean;
}) {
  return (
    <RadioGroup
      value={disabled ? 'all' : filters.trackedFilter}
      onValueChange={(value) => onChange({ ...filters, trackedFilter: value as TrackedFilter })}
      disabled={disabled}
      className={disabled ? 'pointer-events-none opacity-50' : undefined}
    >
      {TRACKED_OPTIONS.map(({ value, label }) => (
        <div key={value} className="flex items-center gap-2">
          <RadioGroupItem value={value} id={`tracked-${value}`} disabled={disabled} />
          <Label htmlFor={`tracked-${value}`} className="cursor-pointer text-sm font-normal">
            {label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}
