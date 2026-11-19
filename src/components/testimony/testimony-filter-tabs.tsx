'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Layers, PenLine } from 'lucide-react';
import { cn } from '@/lib/core/utils';
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
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
              active
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {counts !== null && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                  active ? 'bg-white/20 text-white' : 'bg-secondary text-muted-foreground',
                )}
              >
                {counts[count]}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
