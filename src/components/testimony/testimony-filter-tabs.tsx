'use client';

import { Check, Layers, PenLine } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { FilterPillCount, filterPillClassName } from '@/components/take-action/filter-pill';
import { useTestimonies } from '@/hooks/use-testimonies';
import type { TestimoniesFilter } from './testimonies-view';

const TABS = [
  { key: 'all', label: 'All', icon: Layers },
  { key: 'drafts', label: 'Drafts', icon: PenLine },
  { key: 'submitted', label: 'Submitted', icon: Check },
] as const;

/**
 * All / Drafts / Submitted filter for the Testimony tab of Take Action —
 * pills with live counts from the shared testimony cache. Like Contact
 * Legislators, they switch the list in place (the view owns the filter), so
 * only the list re-animates. Lives in the page body; the header holds the
 * Testimony / Contact Legislators tabs.
 */
export function TestimonyFilterTabs({
  filter,
  onSelect,
  className,
}: {
  filter: TestimoniesFilter;
  onSelect: (filter: TestimoniesFilter) => void;
  className?: string;
}) {
  const { items } = useTestimonies();

  const counts =
    items === null
      ? null
      : {
          all: items.length,
          drafts: items.filter((item) => item.submittedAt === null).length,
          submitted: items.filter((item) => item.submittedAt !== null).length,
        };

  return (
    <nav aria-label="Filter testimonies" className={cn('flex flex-wrap gap-1.5', className)}>
      {TABS.map(({ key, label, icon: Icon }) => {
        const active = filter === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={active}
            className={filterPillClassName(active)}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {counts !== null && <FilterPillCount active={active} count={counts[key]} />}
          </button>
        );
      })}
    </nav>
  );
}
