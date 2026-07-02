'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, KanbanSquareIcon, LayoutGrid, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NAV_ITEMS = [
  { href: '/search', label: 'Search', icon: Search },
  { href: '/', label: 'Your Bills', icon: KanbanSquareIcon },
  { href: '/testimonies', label: 'Your Testimonies', icon: FileText },
  { href: '/boards', label: 'View Active Boards', icon: LayoutGrid },
] as const;

export function isNavItemActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 rounded-md bg-secondary p-1 shadow-sm">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
            isNavItemActive(href, pathname)
              ? 'bg-primary text-white'
              : 'text-secondary-foreground hover:bg-white/50'
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
