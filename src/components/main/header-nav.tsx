'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, KanbanSquareIcon, LayoutGrid, Search } from 'lucide-react';
import { cn } from '@/lib/core/utils';

export const NAV_ITEMS = [
  { href: '/search', label: 'Search', icon: Search },
  { href: '/', label: 'Your Bills', icon: KanbanSquareIcon },
  { href: '/testimonies', label: 'Testimonies', icon: FileText },
  { href: '/boards', label: 'Active Boards', icon: LayoutGrid },
] as const;

export function isNavItemActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-5">
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
