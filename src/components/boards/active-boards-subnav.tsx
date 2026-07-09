'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KanbanSquareIcon, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/boards', label: 'View Board', icon: KanbanSquareIcon },
  { href: '/boards/browse', label: 'Browse Orgs', icon: Building2 },
] as const;

export function isActiveBoardsTabActive(href: string, pathname: string) {
  return href === '/boards' ? pathname === '/boards' : pathname.startsWith(href);
}

/**
 * Sub-navigation for the Active Boards section — link-based tabs styled to
 * match TestimoniesSubNav (same bg-secondary pill, active = bg-primary
 * text-white). No counts. `compact` renders icon-only tabs for tight spots
 * like the mobile header's center slot.
 */
export function ActiveBoardsSubNav({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Active board views"
      className={cn('inline-flex h-10 items-center rounded-md bg-secondary p-1 shadow-sm', className)}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActiveBoardsTabActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-sm py-1.5 text-sm font-medium transition-all',
              compact ? 'px-2' : 'px-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
              active
                ? 'bg-primary text-white shadow-sm'
                : 'text-secondary-foreground hover:bg-white/50',
            )}
          >
            <Icon className={cn(compact ? 'h-5 w-5' : 'h-4 w-4 mr-2')} />
            {!compact && label}
          </Link>
        );
      })}
    </nav>
  );
}
