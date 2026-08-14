'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, KanbanSquareIcon, LayoutGrid, Search } from 'lucide-react';
import { cn } from '@/lib/core/utils';

export const NAV_ITEMS = [
  { href: '/search', label: 'Search', icon: Search },
  { href: '/', label: 'Your Bills', icon: KanbanSquareIcon },
  { href: '/testimonies', label: 'Testimonies', icon: FileText },
  // Lands on Browse, the section's public entry point — View Board is only
  // meaningful once you already follow an org.
  { href: '/boards/browse', label: 'Active Boards', icon: LayoutGrid },
] as const;

export function isNavItemActive(href: string, pathname: string) {
  if (href === '/') return pathname === '/';
  // Active Boards owns the whole /boards tree, not just its own href, so the
  // tab stays highlighted on /boards (View Board) too.
  if (href === '/boards/browse') return pathname.startsWith('/boards');
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
