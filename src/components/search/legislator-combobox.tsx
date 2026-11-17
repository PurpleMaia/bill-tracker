'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/core/utils';
import { formatLegislatorLabel, formatRoles } from '@/lib/legislators/legislator-labels';
import type { LegislatorOption } from '@/types/legislation';

interface LegislatorComboboxProps {
  /** Accessible name of the trigger, e.g. "Introduced by". */
  label: string;
  /** Already sorted A–Z by the query; rendered in the given order. */
  options: LegislatorOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Show each option's committee roles under its name. */
  showRoles?: boolean;
  /** Shown when the search matches no option. */
  emptyText: string;
  /** Options are still loading: trigger is disabled with a loading label. */
  loading?: boolean;
  /** Options failed to load: trigger is disabled with a short notice. */
  error?: boolean;
}

/**
 * cmdk's default fuzzy scorer also matches each item's `value` (here a uuid),
 * so hex-ish queries would hit unrelated rows. Match plain substrings of the
 * name keywords instead; equal scores keep the incoming A–Z order.
 */
function filterByName(_value: string, search: string, keywords?: string[]): number {
  const needle = search.trim().toLowerCase();
  if (!needle) return 1;
  return (keywords ?? []).join(' ').toLowerCase().includes(needle) ? 1 : 0;
}

/** Searchable single-select legislator picker (shadcn Popover + Command). */
export function LegislatorCombobox({
  label,
  options,
  value,
  onChange,
  showRoles = false,
  emptyText,
  loading = false,
  error = false,
}: LegislatorComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? options.find((o) => o.id === value) : undefined;

  const triggerText = loading
    ? 'Loading legislators…'
    : error
      ? "Couldn't load legislators"
      : selected
        ? formatLegislatorLabel(selected)
        : value
          ? 'Selected legislator'
          : 'Any legislator';

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            disabled={loading || error}
            className="h-9 min-w-0 flex-1 justify-between px-3 text-xs font-normal"
          >
            <span className={cn('truncate', !value && 'text-muted-foreground')}>{triggerText}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[17rem] p-0">
          <Command filter={filterByName}>
            <CommandInput placeholder="Search by name…" className="h-9 text-xs" />
            <CommandList className="max-h-72">
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                {emptyText}
              </CommandEmpty>
              {options.map((o) => {
                const roles = showRoles ? formatRoles(o) : '';
                return (
                  <CommandItem
                    key={o.id}
                    value={o.id}
                    keywords={[`${o.firstName} ${o.lastName}`, `${o.lastName}, ${o.firstName}`]}
                    onSelect={() => {
                      onChange(o.id === value ? null : o.id);
                      setOpen(false);
                    }}
                    // Same light hover as the Bill Status rows (hover:bg-muted), not the teal accent.
                    className="cursor-pointer items-start gap-2 text-xs data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
                  >
                    <Check
                      className={cn(
                        'mt-0.5 h-3.5 w-3.5 shrink-0',
                        o.id === value ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block leading-tight">{formatLegislatorLabel(o)}</span>
                      {roles && (
                        <span className="block text-[11px] leading-tight text-muted-foreground">
                          {roles}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Clear ${label} filter`}
          className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
