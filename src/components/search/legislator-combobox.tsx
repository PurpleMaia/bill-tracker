'use client';

import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  /** Selected legislator ids; a bill matches ANY of them. */
  value: string[];
  onChange: (ids: string[]) => void;
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

/**
 * Searchable multi-select legislator picker (shadcn Popover + Command): a
 * checkbox list that stays open while you tick several. Clearing lives in the
 * fieldset's Reset link, like the Stage filter.
 */
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
  const selectedSet = new Set(value);
  // One pick shows its name; until options load (or if the id isn't among them)
  // fall back to a generic label so the trigger never reads empty.
  const single = value.length === 1 ? options.find((o) => o.id === value[0]) : undefined;

  const toggle = (id: string) =>
    onChange(selectedSet.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  const triggerText = loading
    ? 'Loading legislators…'
    : error
      ? "Couldn't load legislators"
      : value.length === 0
        ? 'Any legislator'
        : value.length === 1
          ? single
            ? formatLegislatorLabel(single)
            : 'Selected legislator'
          : `${value.length} legislators`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={loading || error}
          className="group h-9 w-full justify-between px-3 text-xs font-normal"
        >
          {/* The outline hover fills deep teal; the muted placeholder must flip
              to the accent foreground (white) with it or it reads gray-on-teal. */}
          <span
            className={cn(
              'truncate',
              value.length === 0 && 'text-muted-foreground group-hover:text-accent-foreground',
            )}
          >
            {triggerText}
          </span>
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
              const checked = selectedSet.has(o.id);
              return (
                <CommandItem
                  key={o.id}
                  value={o.id}
                  keywords={[`${o.firstName} ${o.lastName}`, `${o.lastName}, ${o.firstName}`]}
                  // Stays open: ticking several is the point of the list.
                  onSelect={() => toggle(o.id)}
                  // Same light hover as the Bill Status rows (hover:bg-muted), not the teal accent.
                  className="cursor-pointer items-start gap-2 text-xs data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
                >
                  {/* Visual only: the row itself is the control (cmdk handles
                      click/Enter), so the box stays out of the tab order. */}
                  <Checkbox
                    checked={checked}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none mt-0.5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block leading-tight">
                      {formatLegislatorLabel(o)}
                      {checked && <span className="sr-only"> (selected)</span>}
                    </span>
                    {roles && (
                      <span className="block text-xs leading-tight text-muted-foreground">
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
  );
}
