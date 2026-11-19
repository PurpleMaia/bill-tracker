'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KanbanSquareIcon, LayoutGrid, Megaphone, Search } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { TAKE_ACTION_ROOT, isTakeActionPath } from '@/lib/take-action/routes';
import { isActiveBoardsPath } from '@/lib/boards/board-routes';

export const NAV_ITEMS = [
  { href: '/discover', label: 'Discover', icon: Search },
  { href: '/your-bills', label: 'Your Bills', icon: KanbanSquareIcon },
  // Testimony + Contact Legislators; /take-action lands on the Testimony tab.
  { href: TAKE_ACTION_ROOT, label: 'Take Action', icon: Megaphone },
  // Lands on Following; its empty state and login wall both point to Browse.
  { href: '/boards', label: 'Active Boards', mobileLabel: 'Boards', icon: LayoutGrid },
] as const;

export function isNavItemActive(href: string, pathname: string) {
  // '/' is Discover (the landing page), so the bare root highlights that tab.
  if (href === '/discover') return pathname === '/' || pathname.startsWith('/discover');
  // Active Boards owns the whole /boards tree plus public /org/<slug> boards, so
  // the tab stays highlighted on /boards/browse and shared board links too.
  if (href === '/boards') return isActiveBoardsPath(pathname);
  if (href === TAKE_ACTION_ROOT) return isTakeActionPath(pathname);
  return pathname.startsWith(href);
}

export function HeaderNav() {
  const pathname = usePathname();

  // Tighter gap below xl so this cluster fits its grid track and doesn't
  // overlap the centered sub-nav; roomier once there's space for it.
  return (
    <nav className="flex items-center gap-3 xl:gap-5">
      {NAV_ITEMS.map(({ href, label }) => {
        const active = isNavItemActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            data-tour={`nav-${href}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap text-sm font-medium underline-offset-8 transition-colors duration-150',
              'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
              active
                ? 'text-white underline decoration-olive decoration-2'
                : 'text-primary-foreground/80 hover:text-white'
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
