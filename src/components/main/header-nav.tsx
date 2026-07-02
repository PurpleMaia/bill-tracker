'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, KanbanSquareIcon, LayoutGrid, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      {NAV_ITEMS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'whitespace-nowrap text-sm font-medium underline-offset-8 transition-colors duration-150',
            isNavItemActive(href, pathname)
              ? 'text-white underline decoration-olive decoration-2'
              : 'text-primary-foreground/70 hover:text-white'
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
