'use client';

import { X } from 'lucide-react';
import { stageLabel } from '@/lib/bills/stage-labels';
import { DEFAULT_FILTERS, type SearchFilters } from '@/lib/bills/search-params';

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface ActiveFilterChipsProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  onClear: () => void;
}

/**
 * Removable chips for every non-default filter, shown under the search bar.
 *
 * The rail already holds these controls, but on mobile it's behind a sheet and on
 * desktop the Stage list is scrolled — either way a filter can be applied without
 * being visible. The chips make the active set legible and dismissable from where
 * the user is already looking.
 */
export function ActiveFilterChips({ filters, onChange, onClear }: ActiveFilterChipsProps) {
  const chips: Chip[] = [];

  // Year is the one filter with a non-empty default ([2026]), so a chip appears
  // whenever the selection differs from it — including when it's been emptied.
  const defaultYears = [...DEFAULT_FILTERS.years].sort((a, b) => a - b);
  const currentYears = [...filters.years].sort((a, b) => a - b);
  const yearsDiffer = JSON.stringify(currentYears) !== JSON.stringify(defaultYears);

  if (yearsDiffer) {
    if (filters.years.length === 0) {
      chips.push({
        key: 'years-all',
        label: 'all sessions',
        onRemove: () => onChange({ ...filters, years: DEFAULT_FILTERS.years }),
      });
    } else {
      for (const year of currentYears) {
        chips.push({
          key: `year-${year}`,
          label: String(year),
          onRemove: () => onChange({ ...filters, years: filters.years.filter((y) => y !== year) }),
        });
      }
    }
  }

  for (const chamber of filters.chambers) {
    chips.push({
      key: `chamber-${chamber}`,
      label: chamber,
      onRemove: () =>
        onChange({ ...filters, chambers: filters.chambers.filter((c) => c !== chamber) }),
    });
  }

  if (filters.deadFilter !== DEFAULT_FILTERS.deadFilter) {
    chips.push({
      key: 'dead',
      label: filters.deadFilter === 'alive' ? 'alive only' : 'dead only',
      onRemove: () => onChange({ ...filters, deadFilter: DEFAULT_FILTERS.deadFilter }),
    });
  }

  if (filters.trackedFilter !== DEFAULT_FILTERS.trackedFilter) {
    chips.push({
      key: 'tracked',
      label: filters.trackedFilter === 'tracked' ? 'tracked' : 'not tracked',
      onRemove: () => onChange({ ...filters, trackedFilter: DEFAULT_FILTERS.trackedFilter }),
    });
  }

  for (const stage of filters.stages) {
    chips.push({
      key: `stage-${stage}`,
      label: stageLabel(stage),
      onRemove: () => onChange({ ...filters, stages: filters.stages.filter((s) => s !== stage) }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={`Remove ${chip.label} filter`}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs capitalize text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {chip.label}
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
