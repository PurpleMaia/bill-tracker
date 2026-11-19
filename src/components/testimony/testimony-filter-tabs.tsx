'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Layers, PenLine } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { FilterPillCount, filterPillClassName } from '@/components/take-action/filter-pill';
import { useTestimonies } from '@/hooks/use-testimonies';
import {
  TESTIMONY_DRAFTS_HREF,
  TESTIMONY_HREF,
  TESTIMONY_SUBMITTED_HREF,
} from '@/lib/take-action/routes';

const TABS = [
  { href: TESTIMONY_HREF, label: 'All', icon: Layers, count: 'all' },
  { href: TESTIMONY_DRAFTS_HREF, label: 'Drafts', icon: PenLine, count: 'drafts' },
  { href: TESTIMONY_SUBMITTED_HREF, label: 'Submitted', icon: Check, count: 'submitted' },
] as const;

export function isTestimonyFilterActive(href: string, pathname: string) {
  return href === TESTIMONY_HREF ? pathname === TESTIMONY_HREF : pathname.startsWith(href);
}

/**
 * All / Drafts / Submitted filter for the Testimony tab of Take Action —
 * link-based pills with live counts from the shared testimony cache. Lives in
 * the page body; the header holds the Testimony / Contact Legislators tabs.
 */
export function TestimonyFilterTabs({ className }: { className?: string }) {
  const pathname = usePathname();
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
      {TABS.map(({ href, label, icon: Icon, count }) => {
        const active = isTestimonyFilterActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={filterPillClassName(active)}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {counts !== null && <FilterPillCount active={active} count={counts[count]} />}
          </Link>
        );
      })}
    </nav>
  );
}
