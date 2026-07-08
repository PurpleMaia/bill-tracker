'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Layers, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTestimonies } from '@/hooks/use-testimonies';

const TABS = [
  { href: '/testimonies', label: 'All', icon: Layers, count: 'all' },
  { href: '/testimonies/drafts', label: 'Drafts', icon: PenLine, count: 'drafts' },
  { href: '/testimonies/submitted', label: 'Submitted', icon: Check, count: 'submitted' },
] as const;

export function isTestimoniesTabActive(href: string, pathname: string) {
  return href === '/testimonies' ? pathname === '/testimonies' : pathname.startsWith(href);
}

/**
 * Sub-navigation for the Testimonies section — link-based tabs styled to
 * match the board's ViewToggle, with live counts from the shared testimony
 * cache. Rendered in the header's center slot on desktop and inline at the
 * top of the page on mobile.
 */
export function TestimoniesSubNav({ className }: { className?: string }) {
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
    <nav
      aria-label="Testimony views"
      className={cn('inline-flex items-center rounded-md bg-secondary p-1 shadow-sm', className)}
    >
      {TABS.map(({ href, label, icon: Icon, count }) => {
        const active = isTestimoniesTabActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              // py-2 on mobile keeps taps near the 44px minimum; tighter in the desktop header
              'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium transition-all md:py-1.5',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
              active
                ? 'bg-primary text-white shadow-sm'
                : 'text-secondary-foreground hover:bg-white/50',
            )}
          >
            <Icon className="h-4 w-4 mr-2" />
            {label}
            {counts !== null && (
              <span
                className={cn(
                  'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                  active ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground',
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
